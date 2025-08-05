import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Redeem LinkedIn share bonus - grants +1 query per month
 * Protected by middleware - requires authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    // Extract user info from middleware headers
    const userId = req.headers.get('x-user-id');
    const userEmail = req.headers.get('x-user-email');

    if (!userId) {
      return NextResponse.json(
        { error: 'User authentication required' },
        { status: 401 }
      );
    }

    // Calculate start of current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Check if user already has a share bonus for this month
    const { data: existingShare } = await supabaseAdmin
      .from('user_shares')
      .select('id')
      .eq('user_id', userId)
      .gte('shared_at', startOfMonth.toISOString())
      .single();

    if (existingShare) {
      return NextResponse.json(
        { 
          error: 'Share bonus already used this month',
          message: 'You can only redeem one LinkedIn share bonus per month.'
        },
        { status: 400 }
      );
    }

    // Check if user is already a subscriber (they don't need bonus queries)
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single();

    const isSubscriber = subscription && ['trialing', 'active'].includes(subscription.status);

    if (isSubscriber) {
      return NextResponse.json(
        {
          message: 'You already have unlimited queries with your Pro subscription!',
          isSubscriber: true,
          bonusGranted: false
        }
      );
    }

    // Grant the share bonus
    await supabaseAdmin
      .from('user_shares')
      .insert({ user_id: userId });

    // Calculate current usage to show updated remaining count
    const { count: queryCount } = await supabaseAdmin
      .from('user_queries')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const { count: shareCount } = await supabaseAdmin
      .from('user_shares')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .gte('shared_at', startOfMonth.toISOString());

    // Calculate remaining queries: 2 base + share bonuses (max 1)
    const allowedQueries = 2 + Math.min(shareCount || 0, 1);
    const currentQueries = queryCount || 0;
    const remaining = Math.max(0, allowedQueries - currentQueries);

    return NextResponse.json({
      success: true,
      message: 'LinkedIn share bonus granted! You now have +1 additional query this month.',
      bonusGranted: true,
      remaining: remaining,
      totalAllowed: allowedQueries,
      isSubscriber: false
    });

  } catch (error: any) {
    console.error('Share bonus redemption error:', error);
    return NextResponse.json(
      { error: 'Failed to redeem share bonus' },
      { status: 500 }
    );
  }
}

/**
 * Get current share bonus status for the user
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

    // Calculate start of current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Check current usage and bonuses
    const [queryResult, shareResult, subscriptionResult] = await Promise.all([
      supabaseAdmin
        .from('user_queries')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString()),
      
      supabaseAdmin
        .from('user_shares')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('shared_at', startOfMonth.toISOString()),
      
      supabaseAdmin
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .single()
    ]);

    const queryCount = queryResult.count || 0;
    const shareCount = shareResult.count || 0;
    const isSubscriber = subscriptionResult.data && 
      ['trialing', 'active'].includes(subscriptionResult.data.status);

    if (isSubscriber) {
      return NextResponse.json({
        isSubscriber: true,
        unlimited: true,
        bonusAvailable: false,
        message: 'You have unlimited queries with your Pro subscription'
      });
    }

    const allowedQueries = 2 + Math.min(shareCount, 1);
    const remaining = Math.max(0, allowedQueries - queryCount);
    const bonusUsed = shareCount > 0;

    return NextResponse.json({
      isSubscriber: false,
      unlimited: false,
      queriesUsed: queryCount,
      queriesRemaining: remaining,
      totalAllowed: allowedQueries,
      bonusUsed: bonusUsed,
      bonusAvailable: !bonusUsed,
      message: bonusUsed 
        ? 'Share bonus already used this month'
        : 'Share on LinkedIn to get +1 bonus query'
    });

  } catch (error: any) {
    console.error('Share status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check share status' },
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}