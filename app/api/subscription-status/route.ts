import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Stripe from 'stripe';
import { CREDITS_CONFIG } from '@/app/config/credits';

/**
 * Get current subscription status for the authenticated user
 * Protected by middleware - requires authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    // Extract user info from middleware headers
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User authentication required' },
        { status: 401 }
      );
    }

    // Get subscription status
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching subscription:', error);
      return NextResponse.json(
        { error: 'Failed to fetch subscription status' },
        { status: 500 }
      );
    }

    const isSubscriber = subscription && ['trialing', 'active'].includes(subscription.status);

    // Optional enrichment from Stripe (plan nickname, latest invoice status)
    let planName: string | null = null;
    let latestInvoiceStatus: string | null = null;
    let trialEnd: string | null = null;
    if (subscription) {
      // trialEnd is an alias of currentPeriodEnd during trial
      if (subscription.status === 'trialing' && subscription.current_period_end) {
        trialEnd = subscription.current_period_end;
      }

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const stripeSubscriptionId = subscription.stripe_subscription_id;
      if (stripeSecretKey && stripeSubscriptionId) {
        try {
          const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
            expand: ['items.data.price', 'latest_invoice'],
          });
          const firstItem = stripeSub.items.data[0];
          const price: any = firstItem?.price as any;
          planName = price?.nickname || null;

          const li = stripeSub.latest_invoice as any;
          if (li && typeof li === 'object') {
            latestInvoiceStatus = li.status || null;
          } else if (typeof li === 'string') {
            const inv = await stripe.invoices.retrieve(li);
            latestInvoiceStatus = inv.status || null;
          }
        } catch (e) {
          // Best-effort enrichment; ignore failures
          planName = planName ?? null;
          latestInvoiceStatus = latestInvoiceStatus ?? null;
        }
      }
    }

    // Calculate current month usage if not a subscriber
    let usage = null;
    if (!isSubscriber) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [queryResult, shareResult] = await Promise.all([
        supabaseAdmin
          .from('user_queries')
          .select('*', { head: true, count: 'exact' })
          .eq('user_id', userId)
          .gte('created_at', startOfMonth.toISOString()),
        
        supabaseAdmin
          .from('user_shares')
          .select('*', { head: true, count: 'exact' })
          .eq('user_id', userId)
          .gte('shared_at', startOfMonth.toISOString())
      ]);

      const queryCount = queryResult.count || 0;
      const shareCount = shareResult.count || 0;
      const allowedQueries = CREDITS_CONFIG.FREE_USER_MONTHLY_CREDITS + 
        Math.min(shareCount, CREDITS_CONFIG.FREE_USER_SHARE_BONUS_MAX);
      const remaining = Math.max(0, allowedQueries - queryCount);

      usage = {
        queriesUsed: queryCount,
        queriesRemaining: remaining,
        totalAllowed: allowedQueries,
        sharesBonusUsed: shareCount > 0,
        sharesBonusAvailable: shareCount === 0
      };
    }

    return NextResponse.json({
      isSubscriber,
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        trialEnd,
        planName,
        latestInvoiceStatus,
        stripeCustomerId: subscription.stripe_customer_id,
        stripeSubscriptionId: subscription.stripe_subscription_id
      } : null,
      usage,
      unlimited: isSubscriber
    });

  } catch (error: any) {
    console.error('Subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription status' },
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}