// app/api/stripe-webhook/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { recordProcessedEvent, upsertSubscriptionFromEvent, upsertCustomerLink } from '@/lib/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
});

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('stripe_webhook_missing_config');
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    console.warn('stripe_webhook_missing_signature');
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('stripe_webhook_signature_error', String(err));
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  console.log('stripe_webhook_event', { 
    id: event.id, 
    type: event.type
  });
  
  const alreadyProcessed = await recordProcessedEvent(event.id);
  if (alreadyProcessed) {
    console.log('stripe_webhook_duplicate_event', { id: event.id });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('stripe_checkout_completed', { sessionId: session.id });

        {
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;
          const email = session.customer_details?.email || session.customer_email || session.metadata?.email;
          const userId = session.metadata?.user_id || session.metadata?.supabase_user_id || null;

          if (customerId) {
            await upsertCustomerLink({
              userId,
              email: email?.toLowerCase() ?? null,
              stripeCustomerId: customerId
            });
          } else {
            console.warn('stripe_checkout_missing_customer', { sessionId: session.id });
          }
        }
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':  
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        console.log('stripe_subscription_event', { subscriptionId: subscription.id, status: subscription.status });
        await upsertSubscriptionFromEvent(event);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        console.log('stripe_invoice_event', { invoiceId: (event.data.object as Stripe.Invoice).id, type: event.type });
        await upsertSubscriptionFromEvent(event);
        break;
      default:
        console.log('Unhandled event type:', event.type);
        break;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('stripe_webhook_handler_error', { 
      type: event.type, 
      id: event.id, 
      error: String(err)
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

// Handle GET requests for health checks
export async function GET() {
  return NextResponse.json({ 
    ok: true,
    endpoint: '/api/stripe-webhook',
    methods: ['GET', 'POST', 'OPTIONS'],
    health: 'healthy'
  }, { status: 200 });
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
    }
  });
}
