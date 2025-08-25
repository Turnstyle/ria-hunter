// app/_backend/api/stripe-webhook/route.ts
import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { upsertCustomerLink, setSubscriberByCustomerId, isSubscriptionActive } from '@/lib/billing';

export const runtime = 'nodejs';         // force Node (NOT Edge)
export const dynamic = 'force-dynamic';  // never cache webhooks

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Keep current account API version; do not hardcode if types complain
  // apiVersion: '2025-06-30.basil' as any
});

// Log environment check at boot time
console.log(`[boot] stripeSecret: ${Boolean(process.env.STRIPE_SECRET_KEY)}, webhookSecret: ${Boolean(process.env.STRIPE_WEBHOOK_SECRET)}, supabase: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`);

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('stripe_webhook_signature_error', { message: (err as Error).message });
    return new Response(JSON.stringify({ ok: false, error: 'invalid_signature' }), { status: 400 });
  }

  // Log basic event info for tracking
  const customerId = getCustomerId(event.data.object);
  console.log('stripe_webhook_event', { 
    id: event.id, 
    type: event.type, 
    customerId 
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;

      // Add others if needed; unknown types should be no-ops.
      default:
        break;
    }
    // Always 200 to prevent endless retries; log internal errors below.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('stripe_webhook_processing_error', {
      eventId: event.id,
      type: event.type,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    // Still 200—Stripe has the event; we'll investigate via logs.
    return new Response(JSON.stringify({ ok: true, warn: 'processing_error' }), { status: 200 });
  }
}

/** Helper to extract customer ID from any Stripe object */
function getCustomerId(object: any): string | null {
  if (!object) return null;
  if (typeof object.customer === 'string') return object.customer;
  if (object.customer?.id) return object.customer.id;
  return null;
}

async function handleSubscriptionChange(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id!;
  const active = isSubscriptionActive(sub);
  await setSubscriberByCustomerId(customerId, active);
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = (typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id) as string;

  // Best-effort linkage by metadata or email
  await upsertCustomerLink({
    userId: (session.metadata && (session.metadata.user_id || session.metadata.userId)) || null,
    email: session.customer_details?.email ?? null,
    stripeCustomerId: customerId,
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