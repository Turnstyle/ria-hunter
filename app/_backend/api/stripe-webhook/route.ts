// app/_backend/api/stripe-webhook/route.ts
import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { linkStripeCustomerToUser, markSubscriptionStatus } from '@/lib/billing';

export const runtime = 'nodejs';         // force Node (NOT Edge)
export const dynamic = 'force-dynamic';  // never cache webhooks

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

// Log environment check at boot time
console.log(`[boot] stripeSecret: ${Boolean(process.env.STRIPE_SECRET_KEY)}, webhookSecret: ${Boolean(process.env.STRIPE_WEBHOOK_SECRET)}, supabase: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`);

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    console.error('[webhook] missing stripe-signature');
    return json(400, { ok: false, error: 'missing_signature' });
  }

  // IMPORTANT: read raw body text for signature verification
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err?.message);
    // Tell Stripe it's a bad signature so it won't keep retrying this specific attempt
    return json(400, { ok: false, error: 'signature_verification_failed' });
  }

  try {
    // Handle the core subscription lifecycle events
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionEvent(sub, event.type);
        break;
      }

      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(cs);
        break;
      }

      default:
        console.log('[webhook] ignoring event:', event.type);
    }

    // ALWAYS 200 so Stripe stops retrying. Internal failures must be logged, not bubbled.
    return json(200, { ok: true });
  } catch (err) {
    console.error('[webhook] handler error:', err);
    // Acknowledge anyway to stop retries; keep details in our logs.
    return json(200, { ok: true, handled: false });
  }
}

/** ===== Helpers ===== */

type MaybeString = string | null | undefined;

async function handleCheckoutCompleted(cs: Stripe.Checkout.Session) {
  const custId = (cs.customer as MaybeString) || undefined;
  const email =
    (typeof cs.customer_details?.email === 'string' && cs.customer_details?.email) ||
    (typeof cs.customer_email === 'string' && cs.customer_email) ||
    undefined;

  console.log('[webhook] checkout.session.completed', { id: cs.id, customer: custId, email });

  // Link customer/email to a user account record if possible.
  await linkStripeCustomerToUser({ stripeCustomerId: custId, email, metadata: cs.metadata ?? {} });
}

async function handleSubscriptionEvent(sub: Stripe.Subscription, type: string) {
  const subId = sub.id;
  const custId = (sub.customer as MaybeString) || undefined;
  const status = sub.status;
  const priceIds = sub.items.data.map(i => i.price.id);

  console.log('[webhook] subscription event', { type, subId, custId, status, priceIds });

  // Resolve the user record by Stripe customer ID first, then by email if necessary
  let email: string | undefined;

  if (!custId) {
    // Rare, but be defensive: fetch customer from latest invoice if available
    try {
      if (sub.latest_invoice && typeof sub.latest_invoice === 'string') {
        const inv = await stripe.invoices.retrieve(sub.latest_invoice);
        if (typeof inv.customer_email === 'string') email = inv.customer_email;
      }
    } catch (e) {
      console.warn('[webhook] could not resolve email via invoice', sub.latest_invoice);
    }
  }

  await markSubscriptionStatus({
    stripeCustomerId: custId,
    email,
    subscriptionId: subId,
    status,
    priceIds,
  });
}

// Handle preflight requests
export async function OPTIONS() {
  return new Response(null, { 
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
    }
  });
}