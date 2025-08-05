import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
      const allowedQueries = 2 + Math.min(shareCount, 1);
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