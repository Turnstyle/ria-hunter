// app/_backend/api/stripe-webhook/route.ts
export const runtime = 'nodejs'  // IMPORTANT
export const dynamic = 'force-dynamic'  // never cache webhooks

import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { upsertSubscriptionFromEvent, recordProcessedEvent } from '@/lib/billing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
})

// Log environment check at boot time
console.log(`[boot] stripeSecret: ${Boolean(process.env.STRIPE_SECRET_KEY)}, webhookSecret: ${Boolean(process.env.STRIPE_WEBHOOK_SECRET)}, supabase: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`)

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
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // Log basic event info for tracking
  console.log('stripe_webhook_event', { 
    id: event.id, 
    type: event.type
  })

  try {
    // Idempotency guard
    const seen = await recordProcessedEvent(event.id)
    if (seen) {
      console.log('stripe_webhook_already_processed', { eventId: event.id })
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await upsertSubscriptionFromEvent(event)
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