import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createAIService, getAIProvider } from '@/lib/ai-providers';
import { corsify } from '@/lib/utils';

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

// Function to generate embedding for search query
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const provider = getAIProvider();
    const ai = createAIService({ provider });
    if (!ai) throw new Error('AI provider not configured');

    const embedding = await ai.generateEmbedding(text);
    return embedding.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const userId = decodeJwtSub(authHeader);
    const body = await req.json().catch(() => null);

    if (!body || typeof body.query !== 'string') {
      return corsify(req, NextResponse.json({ error: 'Invalid body. Expected { "query": string }', code: 'BAD_REQUEST' }, { status: 400 }));
    }

    const { query, state, useHybridSearch, minVcActivity, minAum, limit } = body as {
      query: string;
      state?: string;
      useHybridSearch?: boolean;
      minVcActivity?: number;
      minAum?: number;
      limit?: number;
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
      if (anonCount >= 2) {
        return corsify(
          req,
          NextResponse.json(
            {
              error: 'Free query limit reached. Create an account for more searches.',
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

    // Generate embedding for the query
    const embedding = await generateEmbedding(query);
    if (!embedding) {
      return corsify(req, NextResponse.json({ error: 'Failed to generate query embedding', code: 'INTERNAL_ERROR' }, { status: 500 }));
    }

    let results;
    
    if (useHybridSearch) {
      // Use hybrid search combining vector similarity and text search
      const { data, error } = await supabaseAdmin.rpc('hybrid_search_rias', {
        query_text: query,
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: limit || 20,
        state_filter: state || null,
        min_vc_activity: minVcActivity || 0,
        min_aum: minAum || 0
      });

      if (error) {
        console.error('Hybrid search error:', error);
        return corsify(req, NextResponse.json({ error: 'Error performing hybrid search', code: 'INTERNAL_ERROR' }, { status: 500 }));
      }
      
      results = data;
    } else {
      // Use vector similarity search only
      const { data, error } = await supabaseAdmin.rpc('search_rias_by_narrative', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: limit || 20,
        location_filter: state || null,
        min_private_funds: minVcActivity || 0
      });
      
      if (error) {
        console.error('Vector search error:', error);
        return corsify(req, NextResponse.json({ error: 'Error performing vector search', code: 'INTERNAL_ERROR' }, { status: 500 }));
      }
      
      results = data;
    }

    // Enrich results with executives data
    const enrichedResults = await Promise.all((results || []).map(async (result: any) => {
      try {
        const { data: executives } = await supabaseAdmin
          .from('control_persons')
          .select('person_name, title')
          .eq('crd_number', result.crd_number);
          
        return {
          ...result,
          executives: (executives || []).map((exec: any) => ({
            name: exec.person_name,
            title: exec.title
          }))
        };
      } catch (error) {
        console.error(`Error fetching executives for CRD ${result.crd_number}:`, error);
        return { ...result, executives: [] };
      }
    }));

    const response = NextResponse.json({
      results: enrichedResults,
      query,
      total: enrichedResults.length,
      credits: {
        remaining,
        isSubscriber
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
