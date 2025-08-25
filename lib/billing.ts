// lib/billing.ts
import { supabaseAdmin } from './supabaseAdmin';

type LinkArgs = {
  stripeCustomerId?: string;
  email?: string;
  metadata?: Record<string, string | undefined>;
};

/**
 * Link a Stripe customer id and/or email to our user_accounts row.
 * Strategy:
 * 1) If metadata.user_id exists, upsert that row and set stripe_customer_id/email.
 * 2) Else if stripeCustomerId exists, upsert/find by stripe_customer_id.
 * 3) Else if email exists, upsert/find by email.
 */
export async function linkStripeCustomerToUser({ stripeCustomerId, email, metadata }: LinkArgs) {
  try {
    const metaUserId = metadata?.user_id || metadata?.uid || metadata?.userId;

    if (metaUserId) {
      await supabaseAdmin.from('user_accounts').upsert(
        { id: metaUserId, stripe_customer_id: stripeCustomerId ?? null, email: email ?? null },
        { onConflict: 'id' }
      );
      return;
    }

    if (stripeCustomerId) {
      const { data } = await supabaseAdmin
        .from('user_accounts')
        .select('id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();

      if (!data) {
        await supabaseAdmin.from('user_accounts').upsert(
          { stripe_customer_id: stripeCustomerId, email: email ?? null },
          { onConflict: 'stripe_customer_id' }
        );
      }
      return;
    }

    if (email) {
      await supabaseAdmin.from('user_accounts').upsert(
        { email, stripe_customer_id: stripeCustomerId ?? null },
        { onConflict: 'email' }
      );
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
 * Mark subscription status. Consider 'active' and 'trialing' as subscriber = true.
 */
export async function markSubscriptionStatus({ stripeCustomerId, email, subscriptionId, status, priceIds }: MarkArgs) {
  try {
    const isSubscriber = status === 'active' || status === 'trialing';

    let q = supabaseAdmin.from('user_accounts');
    if (stripeCustomerId) {
      q = q.update({
        subscription_id: subscriptionId,
        subscription_status: status,
        is_subscriber: isSubscriber,
        stripe_customer_id: stripeCustomerId,
        plan_price_id: priceIds[0] ?? null,
      }).eq('stripe_customer_id', stripeCustomerId);
      const { data, error, count } = await q.select('id', { count: 'exact' });
      if (error) throw error;
      if ((count ?? 0) > 0) return;
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
