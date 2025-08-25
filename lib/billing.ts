// lib/billing.ts
import type Stripe from 'stripe';
import { supabaseAdmin } from './supabaseAdmin';

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing']);

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
