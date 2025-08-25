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
 * @param eventType The type of the Stripe event
 * @param payload The full event payload for debugging and auditing
 * @returns true if the event was already processed, false if it's new
 */
async function recordEvent(eventId: string, eventType: string, payload: any): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('stripe_events')
      .insert({ 
        id: eventId, 
        type: eventType, 
        payload 
      })
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
 * Resolves a user account ID using multiple possible lookup methods
 * in priority order:
 * 1. metadata.user_id in subscription
 * 2. stripe_customer_id lookup
 * 3. email lookup from Stripe customer
 * 
 * @returns Object with user lookup result and match method used
 */
async function resolveUserAccount(
  customerId?: string, 
  subscriptionMetadata?: Stripe.Metadata
): Promise<{ 
  userAccount: any, 
  matchMethod: 'metadata_user_id' | 'customer_id' | 'email' | 'not_found' 
}> {
  // Option 1: Check metadata.user_id if available
  if (subscriptionMetadata?.user_id) {
    console.info('stripe_webhook_resolving_user', { method: 'metadata_user_id', user_id: subscriptionMetadata.user_id });
    
    const { data: userAccount, error } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('id', subscriptionMetadata.user_id)
      .maybeSingle();
      
    if (!error && userAccount) {
      return { userAccount, matchMethod: 'metadata_user_id' };
    }
  }

  // Option 2: Check stripe_customer_id if available
  if (customerId) {
    console.info('stripe_webhook_resolving_user', { method: 'customer_id', customer_id: customerId });
    
    const { data: userAccount, error } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
      
    if (!error && userAccount) {
      return { userAccount, matchMethod: 'customer_id' };
    }
    
    // Option 3: Fetch customer from Stripe to get email, then look up by email
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted && customer.email) {
        console.info('stripe_webhook_resolving_user', { method: 'email', email: customer.email });
        
        // First check auth.users table
        const { data: authUser } = await supabaseAdmin.auth
          .admin.listUsers({ 
            filters: { email: customer.email } 
          });
          
        // Then look up or create the user_accounts record
        const { data: userAccount, error } = await supabaseAdmin
          .from('user_accounts')
          .select('*')
          .eq('email', customer.email)
          .maybeSingle();
          
        if (!error && userAccount) {
          return { userAccount, matchMethod: 'email' };
        }
        
        // If no user_account but auth user exists, create a new user_account
        if (authUser && authUser.users && authUser.users.length > 0) {
          const authUserObj = authUser.users[0];
          
          const { data: newUserAccount, error: insertError } = await supabaseAdmin
            .from('user_accounts')
            .insert({
              id: authUserObj.id,
              email: authUserObj.email,
              stripe_customer_id: customerId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();
            
          if (!insertError && newUserAccount) {
            return { userAccount: newUserAccount, matchMethod: 'email' };
          }
        }
      }
    } catch (error) {
      console.error('stripe_webhook_customer_fetch_error', { error, customerId });
    }
  }
  
  return { userAccount: null, matchMethod: 'not_found' };
}

/**
 * Processes a subscription event (created, updated, deleted)
 */
async function processSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? 
    subscription.customer : subscription.customer.id;
  
  const status = subscription.status;
  const isPro = ['active', 'trialing', 'past_due'].includes(status);
  const isDeleted = status === 'canceled';
  
  // Resolve the user account using the cascade of lookup methods
  const { userAccount, matchMethod } = await resolveUserAccount(
    customerId,
    subscription.metadata
  );
  
  if (!userAccount) {
    console.warn('stripe_webhook_no_user_found', { 
      customerId,
      subscriptionId: subscription.id,
      metadata: subscription.metadata
    });
    return;
  }
  
  console.info('stripe_webhook_user_matched', { 
    matchMethod,
    userAccountId: userAccount.id,
    email: userAccount.email
  });
  
  // Prepare update data
  const updateData: any = {
    stripe_subscription_id: subscription.id,
    subscription_status: isDeleted ? 'canceled' : status,
    is_pro: isDeleted ? false : isPro,
    updated_at: new Date().toISOString()
  };
  
  // Always set customer ID if we have it and it's not already set
  if (customerId && !userAccount.stripe_customer_id) {
    updateData.stripe_customer_id = customerId;
  }
  
  // Upsert into user_accounts
  const { error } = await supabaseAdmin
    .from('user_accounts')
    .update(updateData)
    .eq('id', userAccount.id);
  
  if (error) {
    console.error('stripe_webhook_update_error', { 
      error, 
      userAccountId: userAccount.id 
    });
  }
}

/**
 * Process a completed checkout session
 */
async function processCheckoutSession(session: Stripe.Checkout.Session) {
  if (!session.subscription) {
    console.info('stripe_webhook_checkout_no_subscription', { 
      sessionId: session.id 
    });
    return;
  }
  
  // Get the subscription to get all required details
  try {
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );
    
    // Process the subscription data
    await processSubscription(subscription);
  } catch (error) {
    console.error('stripe_webhook_checkout_subscription_fetch_error', { 
      error,
      sessionId: session.id,
      subscriptionId: session.subscription
    });
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
    // Idempotency guard - store the full event payload for debugging
    const isDuplicate = await recordEvent(event.id, event.type, event.data.object)
    if (isDuplicate) {
      console.log('stripe_webhook_already_processed', { eventId: event.id })
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await processCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        // No-op but keep idempotency record
        console.log('stripe_webhook_unhandled_event_type', { type: event.type });
        break;
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