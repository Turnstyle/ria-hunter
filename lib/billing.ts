// lib/billing.ts
import type Stripe from 'stripe';
import { supabaseAdmin } from './supabaseAdmin';

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing']);

/**
 * Records a processed Stripe event to prevent duplicate processing
 * @param eventId The Stripe event ID to record
 * @returns true if the event was already processed, false if it's new
 */
export async function recordProcessedEvent(eventId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('stripe_events_processed')
      .insert({ event_id: eventId })
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

export async function upsertCustomerLink(opts: {
  userId?: string | null;
  email?: string | null;
  stripeCustomerId: string;
}) {
  try {
    // 1) Try link by userId if provided.
    // 2) Else link by email if unique.
    // 3) Else upsert row by stripe_customer_id.
    const { userId, email, stripeCustomerId } = opts;

    if (userId) {
      await supabaseAdmin.from('user_accounts')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', userId);
      return;
    }

    if (email) {
      const { data: users } = await supabaseAdmin
        .from('user_accounts')
        .select('id')
        .eq('email', email)
        .limit(2);

      if (users && users.length === 1) {
        await supabaseAdmin.from('user_accounts')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', users[0].id);
        return;
      }
    }

    // Fallback: make sure there's a row keyed by customer id (optional)
    const { data: existing } = await supabaseAdmin
      .from('user_accounts')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from('user_accounts').insert({
        stripe_customer_id: stripeCustomerId,
        email: email ?? null,
        is_subscriber: false,
      });
    }
  } catch (err) {
    console.error('billing_link_error', { 
      message: (err as Error).message,
      stripeCustomerId: opts.stripeCustomerId
    });
  }
}

export async function setSubscriberByCustomerId(stripeCustomerId: string, isSubscriber: boolean) {
  try {
    await supabaseAdmin.from('user_accounts')
      .update({ is_subscriber: isSubscriber })
      .eq('stripe_customer_id', stripeCustomerId);
  } catch (err) {
    console.error('billing_update_error', { 
      message: (err as Error).message,
      stripeCustomerId
    });
  }
}

export function isSubscriptionActive(sub: Stripe.Subscription) {
  return ACTIVE_STATUSES.has(sub.status);
}

/**
 * Process a Stripe webhook event to update subscription state
 * @param event The Stripe event object
 */
export async function upsertSubscriptionFromEvent(event: Stripe.Event): Promise<void> {
  try {
    // Extract relevant data based on event type
    let customerId: string | undefined;
    let isSubscriber = false;
    let planName: string | null = null;
    let periodEnd: string | null = null;
    let status: string | null = null;
    let userId: string | undefined;
    
    if (event.type.startsWith('customer.subscription')) {
      const subscription = event.data.object as Stripe.Subscription;
      customerId = typeof subscription.customer === 'string' ? 
        subscription.customer : subscription.customer?.id;
      
      isSubscriber = isSubscriptionActive(subscription);
      status = subscription.status;
      
      // Extract plan details if available
      if (subscription.items?.data?.[0]?.price?.product) {
        const product = subscription.items.data[0].price.product;
        planName = typeof product === 'string' ? product : product.name;
      }
      
      // Current period end
      periodEnd = subscription.current_period_end ? 
        new Date(subscription.current_period_end * 1000).toISOString() : null;
        
      // Try to get user ID from metadata
      userId = subscription.metadata?.user_id;
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      customerId = typeof invoice.customer === 'string' ? 
        invoice.customer : invoice.customer?.id;
        
      // Get subscription details if available
      if (invoice.subscription) {
        const subId = typeof invoice.subscription === 'string' ? 
          invoice.subscription : invoice.subscription.id;
          
        // For invoice.paid, we could add credits here if using a credit system
        if (event.type === 'invoice.paid' && process.env.WELCOME_CREDITS) {
          // This would be implemented if using a credit system
        }
      }
      
      // Try to get user ID from metadata
      userId = invoice.metadata?.user_id;
    }
    
    if (!customerId) {
      console.warn('stripe_webhook_no_customer', { 
        eventType: event.type,
        eventId: event.id
      });
      return;
    }
    
    // Find the user by stripe_customer_id
    const { data: user } = await supabaseAdmin
      .from('user_accounts')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
      
    // If not found by stripe_customer_id, try to find by user_id from metadata
    if (!user && userId) {
      await supabaseAdmin
        .from('user_accounts')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }
    
    // Update subscription state
    if (customerId) {
      const updates: Record<string, any> = {
        is_subscriber: isSubscriber
      };
      
      if (status !== null) {
        updates.subscription_status = status;
      }
      
      if (planName !== null) {
        updates.plan = planName;
      }
      
      if (periodEnd !== null) {
        updates.current_period_end = periodEnd;
      }
      
      await supabaseAdmin
        .from('user_accounts')
        .update(updates)
        .eq('stripe_customer_id', customerId);
    }
  } catch (err) {
    console.error('stripe_webhook_processing_error', {
      eventType: event.type,
      eventId: event.id,
      error: String(err)
    });
  }
}

// Keeping the legacy functions for compatibility
type LinkArgs = {
  stripeCustomerId?: string;
  email?: string;
  metadata?: Record<string, string | undefined>;
};

/**
 * Legacy: Link a Stripe customer id and/or email to our user_accounts row.
 * @deprecated Use upsertCustomerLink instead
 */
export async function linkStripeCustomerToUser({ stripeCustomerId, email, metadata }: LinkArgs) {
  try {
    const metaUserId = metadata?.user_id || metadata?.uid || metadata?.userId;

    if (stripeCustomerId) {
      await upsertCustomerLink({
        userId: metaUserId || null,
        email: email || null,
        stripeCustomerId
      });
    }
  } catch (err) {
    console.error('[billing] linkStripeCustomerToUser failed', err);
  }
}

type MarkArgs = {
  stripeCustomerId?: string;
  email?: string;
  subscriptionId: string;
  status: string;
  priceIds: string[];
};

/**
 * Legacy: Mark subscription status. Consider 'active' and 'trialing' as subscriber = true.
 * @deprecated Use setSubscriberByCustomerId instead
 */
export async function markSubscriptionStatus({ stripeCustomerId, email, subscriptionId, status, priceIds }: MarkArgs) {
  try {
    const isSubscriber = status === 'active' || status === 'trialing';

    if (stripeCustomerId) {
      await setSubscriberByCustomerId(stripeCustomerId, isSubscriber);
      
      // Additional fields update
      await supabaseAdmin.from('user_accounts')
        .update({
          subscription_id: subscriptionId,
          subscription_status: status,
          plan_price_id: priceIds[0] ?? null,
        })
        .eq('stripe_customer_id', stripeCustomerId);
      return;
    }

    if (email) {
      await supabaseAdmin
        .from('user_accounts')
        .update({
          subscription_id: subscriptionId,
          subscription_status: status,
          is_subscriber: isSubscriber,
          plan_price_id: priceIds[0] ?? null,
        })
        .eq('email', email);
      return;
    }

    console.warn('[billing] markSubscriptionStatus: no key to update (no customer id / email)');
  } catch (err) {
    console.error('[billing] markSubscriptionStatus failed', err);
  }
}
