import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Initialize Stripe with secret key - handle missing key gracefully for build
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20',
}) : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Stripe webhook handler for subscription events
 * This endpoint is NOT protected by auth middleware (raw body needed for signature verification)
 */
export async function POST(request: NextRequest) {
  // Check if Stripe is properly configured
  if (!stripe || !stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured' },
      { status: 503 }
    );
  }

  const sig = request.headers.get('stripe-signature');
  const body = await request.text(); // Raw body as string for signature verification

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err: any) {
    console.error('❌ Stripe webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 });
  }

  console.log('✅ Stripe webhook received:', event.type, 'ID:', event.id);

  // Handle the event
  const data = event.data.object as Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice;
  let userId: string | null = null;

  // Enhanced logging for debugging
  console.log('Processing webhook event:', {
    type: event.type,
    id: event.id,
    created: new Date(event.created * 1000).toISOString(),
    livemode: event.livemode
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        // Subscription checkout completed (subscription is created in Stripe)
        const session = data as Stripe.Checkout.Session;
        userId = session.client_reference_id || null;
        
        if (userId && session.subscription) {
          const subId = session.subscription.toString();
          const cusId = session.customer?.toString();
          
          console.log(`Creating subscription record for user ${userId}`);
          
          await supabaseAdmin.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: cusId,
            stripe_subscription_id: subId,
            status: 'trialing', // Initially trialing due to 7-day trial
            updated_at: new Date().toISOString(),
          });
          
          console.log(`✅ Subscription created for user ${userId} with status: trialing`);
        }
        break;

      case 'customer.subscription.created':
        // A new subscription object was created
        const createdSub = data as Stripe.Subscription;
        userId = createdSub.metadata?.user_id || null;
        
        if (userId) {
          console.log(`Updating subscription record for user ${userId} (created)`);
          
          await supabaseAdmin.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: createdSub.customer.toString(),
            stripe_subscription_id: createdSub.id,
            status: createdSub.status,
            current_period_end: new Date(createdSub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          });
          
          console.log(`✅ Subscription updated for user ${userId} with status: ${createdSub.status}`);
        }
        break;

      case 'customer.subscription.updated':
        // Subscription status changed (e.g., trial -> active, plan changes, etc.)
        const updatedSub = data as Stripe.Subscription;
        userId = updatedSub.metadata?.user_id || null;
        
        if (userId) {
          console.log(`Updating subscription status for user ${userId}: ${updatedSub.status}`);
          
          await supabaseAdmin.from('subscriptions').update({
            status: updatedSub.status,
            current_period_end: new Date(updatedSub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
          
          console.log(`✅ Subscription status updated for user ${userId}: ${updatedSub.status}`);
        }
        break;

      case 'customer.subscription.deleted':
        // Subscription cancelled or expired
        const deletedSub = data as Stripe.Subscription;
        userId = deletedSub.metadata?.user_id || null;
        
        if (userId) {
          console.log(`Canceling subscription for user ${userId}`);
          
          await supabaseAdmin.from('subscriptions').update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
          
          console.log(`✅ Subscription canceled for user ${userId}`);
        }
        break;

      case 'invoice.payment_succeeded':
        // Payment succeeded (trial ended successfully, or recurring payment)
        const invoice = data as Stripe.Invoice;
        if (invoice.subscription) {
          // Get subscription to find user
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription.toString());
          userId = subscription.metadata?.user_id || null;
          
          if (userId) {
            console.log(`Payment succeeded for user ${userId}, updating subscription to active`);
            
            await supabaseAdmin.from('subscriptions').update({
              status: 'active',
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId);
            
            console.log(`✅ Subscription activated for user ${userId} after successful payment`);
          }
        }
        break;

      case 'invoice.payment_failed':
        // Payment failed (trial ended unsuccessfully, or recurring payment failed)
        const failedInvoice = data as Stripe.Invoice;
        if (failedInvoice.subscription) {
          // Get subscription to find user
          const subscription = await stripe.subscriptions.retrieve(failedInvoice.subscription.toString());
          userId = subscription.metadata?.user_id || null;
          
          if (userId) {
            console.log(`Payment failed for user ${userId}, updating subscription to past_due`);
            
            await supabaseAdmin.from('subscriptions').update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId);
            
            console.log(`⚠️ Subscription marked past_due for user ${userId} after payment failure`);
          }
        }
        break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error(`❌ Error processing webhook event ${event.type}:`, error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
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
  });
}