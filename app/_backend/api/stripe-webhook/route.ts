// app/_backend/api/stripe-webhook/route.ts
export const runtime = 'nodejs'  // IMPORTANT
export const dynamic = 'force-dynamic'  // never cache webhooks

import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
})

// Log environment check at boot time
console.log(`[boot] stripeSecret: ${Boolean(process.env.STRIPE_SECRET_KEY)}, webhookSecret: ${Boolean(process.env.STRIPE_WEBHOOK_SECRET)}, supabase: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`)

/**
 * Records a processed Stripe event to prevent duplicate processing
 * @param eventId The Stripe event ID to record
 * @returns true if the event was already processed, false if it's new
 */
async function recordEvent(eventId: string, eventType: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('stripe_events')
      .insert({ id: eventId, type: eventType })
      .select()
      .single();
      
    if (error && error.code === '23505') { // Unique violation (already exists)
      return true;
    }
    
    if (error) {
      console.error('stripe_event_record_error', { 
        message: error.message,
        eventId
      });
    }
    
    return false;
  } catch (err) {
    console.error('stripe_event_record_exception', { 
      message: (err as Error).message,
      eventId
    });
    return false; // Assume not processed before in case of error
  }
}

/**
 * Processes a subscription event
 */
async function processSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? 
    subscription.customer : subscription.customer.id;
  
  const status = subscription.status;
  const isPro = ['active', 'trialing', 'past_due'].includes(status) && 
    !subscription.cancel_at_period_end;
  
  // Fetch customer details to get email
  let customerEmail: string | undefined;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      customerEmail = customer.email || undefined;
    }
  } catch (error) {
    console.error('stripe_webhook_customer_fetch_error', error);
  }
  
  if (!customerEmail) {
    console.warn('stripe_webhook_no_email', { customerId });
    return;
  }
  
  // Upsert into user_accounts
  const { error } = await supabaseAdmin.from('user_accounts')
    .upsert({
      email: customerEmail,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: status,
      is_pro: isPro,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'email'
    });
  
  if (error) {
    console.error('stripe_webhook_upsert_error', { error, email: customerEmail });
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    console.warn('stripe_webhook_missing_signature')
    return NextResponse.json({ ok: true }, { status: 200 }) // don't leak
  }

  const payload = await req.text()
  let event: Stripe.Event
  
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    // Signature invalid or body not raw – never 500 on sig errors
    console.error('stripe_webhook_signature_error', String(err))
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
  }

  // Log basic event info for tracking
  console.log('stripe_webhook_event', { 
    id: event.id, 
    type: event.type
  })

  try {
    // Idempotency guard
    const isDuplicate = await recordEvent(event.id, event.type)
    if (isDuplicate) {
      console.log('stripe_webhook_already_processed', { eventId: event.id })
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscription(event.data.object as Stripe.Subscription)
        break
      default:
        // No-op but keep idempotency record
        console.log('stripe_webhook_unhandled_event_type', { type: event.type })
        break
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    // Always swallow with 200 so Stripe stops retrying; log details to Vercel
    console.error('stripe_webhook_handler_error', { 
      type: event.type, 
      id: event.id, 
      error: String(err)
    })
    return NextResponse.json({ ok: true }, { status: 200 })
  }
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
  })
}