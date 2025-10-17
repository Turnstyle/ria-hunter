import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createAIService } from '@/lib/ai-providers';
import { createResilientAIService } from '@/lib/ai-resilience';
import { performAINativeSearch } from '@/app/api/ask/ai-native-search';
import type { SearchExecutionOptions } from '@/app/api/ask/ai-native-search';
// Credits config removed - now using demo session system
// Local CORS helper function
function corsify(req: NextRequest, res: Response, preflight = false): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (preflight) {
    return new Response(null, { status: 204, headers });
  }
  
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Function to decode JWT and extract user ID
function decodeJwtSub(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload).sub || null;
  } catch (e) {
    return null;
  }
}

// Function to check user query limit
async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }> {
  try {
    // Check if user is a subscriber
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .single();

    const isSubscriber = Boolean(
      subscription?.status === 'active' && 
      new Date(subscription.current_period_end) > new Date()
    );

    if (isSubscriber) {
      return { allowed: true, remaining: -1, isSubscriber: true };
    }

    // Count queries in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count } = await supabaseAdmin
      .from('user_queries')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const freeQueryLimit = 10; // Free tier gets 10 queries per month
    const remaining = Math.max(0, freeQueryLimit - (count || 0));

    return { allowed: remaining > 0, remaining, isSubscriber: false };
  } catch (error) {
    console.error('Error checking query limit:', error);
    // Default to allowing the query in case of errors
    return { allowed: true, remaining: -1, isSubscriber: false };
  }
}

// Function to parse anon cookie (for non-logged-in users)
function parseAnonCookie(req: NextRequest): { count: number } {
  try {
    const cookie = req.cookies.get('anon_queries');
    if (cookie?.value) {
      const parsed = JSON.parse(cookie.value);
      return { count: Number(parsed.count) || 0 };
    }
  } catch {}
  return { count: 0 };
}

// Function to add anon cookie to response
function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', `anon_queries=${JSON.stringify({ count: newCount })};path=/;max-age=2592000`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const userId = decodeJwtSub(authHeader);
    const body = await req.json().catch(() => null);

    if (!body || typeof body.query !== 'string') {
      return corsify(req, NextResponse.json({ error: 'Invalid body. Expected { "query": string }', code: 'BAD_REQUEST' }, { status: 400 }));
    }

    const { query, state, useHybridSearch, minVcActivity, minAum, limit, fundType } = body as {
      query: string;
      state?: string;
      useHybridSearch?: boolean;
      minVcActivity?: number;
      minAum?: number | string;
      limit?: number;
      fundType?: string;  // Added fund type filter
    };

    // Auth and allowance check
    let allowed = true;
    let remaining = -1;
    let isSubscriber = false;
    let needsCookieUpdate = false;
    let anonCount = 0;

    if (userId) {
      const limitInfo = await checkQueryLimit(userId);
      allowed = limitInfo.allowed;
      remaining = limitInfo.remaining;
      isSubscriber = limitInfo.isSubscriber;

      if (!allowed) {
        return corsify(
          req,
          NextResponse.json(
            {
              error: isSubscriber
                ? 'Subscription expired. Please renew your subscription to continue.'
                : 'Free query limit reached. Upgrade to continue.',
              code: 'PAYMENT_REQUIRED',
              remaining,
              isSubscriber,
              upgradeRequired: true,
            },
            { status: 402 }
          )
        );
      }

      // Log this query
      await supabaseAdmin.from('user_queries').insert([{ user_id: userId }]);
    } else {
      // Handle anonymous user
      const anon = parseAnonCookie(req);
      anonCount = anon.count;
      if (anonCount >= 15) { // Hardcoded value from removed CREDITS_CONFIG
        return corsify(
          req,
          NextResponse.json(
            {
              error: 'You have used all 15 free searches. Create an account to continue.',
              code: 'PAYMENT_REQUIRED',
              remaining: 0,
              isSubscriber: false,
              upgradeRequired: true,
            },
            { status: 402 }
          )
        );
      }
      needsCookieUpdate = true;
    }

    const aiService = createResilientAIService(createAIService());
    if (!aiService) {
      return corsify(
        req,
        NextResponse.json({ error: 'AI provider not configured', code: 'INTERNAL_ERROR' }, { status: 500 })
      );
    }

    const overrides: SearchExecutionOptions['overrides'] = {};
    const trimmedState = state?.trim();
    if (trimmedState) {
      overrides.location = { ...(overrides.location || {}), state: trimmedState };
    }

    const normalizedMinAum = typeof minAum === 'string' ? Number(minAum) : minAum;

    if (typeof normalizedMinAum === 'number' && Number.isFinite(normalizedMinAum)) {
      overrides.constraints = {
        ...(overrides.constraints || {}),
        minAum: normalizedMinAum,
      };
    }

    const limitValue = typeof limit === 'number' && limit > 0 ? limit : 20;

    const searchExecution = await performAINativeSearch({
      query,
      limit: limitValue,
      offset: 0,
      aiService,
      overrides: overrides.location || overrides.constraints ? overrides : undefined,
    });

    let enrichedResults = searchExecution.results;

    if (trimmedState) {
      const upperState = trimmedState.toUpperCase();
      enrichedResults = enrichedResults.filter(
        (row) => (row.state || '').toUpperCase() === upperState
      );
    }

    if (typeof minVcActivity === 'number' && Number.isFinite(minVcActivity)) {
      enrichedResults = enrichedResults.filter(
        (row) => Number(row.private_fund_count ?? 0) >= minVcActivity
      );
    }

    if (fundType) {
      const normalizedFundType = fundType.toLowerCase();
      enrichedResults = enrichedResults.filter((row) =>
        (row.private_funds || []).some((fund) =>
          (fund.fund_type || '').toLowerCase().includes(normalizedFundType)
        )
      );
    }

    if (!userId && needsCookieUpdate) {
      anonCount += 1;
    }

    const response = NextResponse.json({
      results: enrichedResults,
      query,
      total: enrichedResults.length,
      availableResults: searchExecution.availableResults,
      credits: {
        remaining,
        isSubscriber
      },
      metadata: {
        strategy: searchExecution.strategy,
        queryPlan: searchExecution.queryPlan,
        routing: searchExecution.routing,
      }
    });

    if (needsCookieUpdate) {
      return withAnonCookie(response, anonCount + 1);
    }

    return corsify(req, response);
  } catch (error) {
    console.error('Error in /api/v1/ria/search:', error);
    return corsify(req, NextResponse.json({ error: 'An internal error occurred', code: 'INTERNAL_ERROR' }, { status: 500 }));
  }
}

export function OPTIONS(req: NextRequest) {
  return corsify(req, NextResponse.json({}, { status: 200 }));
}
