/**
 * Centralized authentication and rate-limiting utilities
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { unauthorized, paymentRequired } from '@/lib/error';
import { corsify } from '@/lib/cors';

// Interface for the rate limit check result
export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  isSubscriber: boolean;
}

/**
 * Decode JWT token from Authorization header
 * @param authHeader Authorization header value
 * @returns User ID from JWT sub claim, or null if invalid/missing
 */
export function decodeJwtSub(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  
  // Extract token from Bearer format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  const token = parts[1];
  const segments = token.split('.');
  if (segments.length < 2) return null;
  
  try {
    // Decode JWT payload
    const payload = JSON.parse(
      Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    return payload?.sub || null;
  } catch {
    return null;
  }
}

/**
 * Check if user has remaining queries based on subscription status and usage
 * @param userId User ID to check
 * @returns Object with allowed status, remaining count, and subscription status
 */
export async function checkQueryLimit(userId: string): Promise<RateLimitCheckResult> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  try {
    // Check if user has an active subscription
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .single();
    
    const isSubscriber = !!(
      subscription && 
      ['trialing', 'active'].includes(subscription.status) &&
      new Date(subscription.current_period_end) > new Date()
    );
    
    // Subscribers have unlimited queries
    if (isSubscriber) {
      return { allowed: true, remaining: -1, isSubscriber: true };
    }
    
    // For free users, check usage against limits
    const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
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
    ]);
    
    // Free users get a base allocation plus bonus for shares
    const FREE_BASE_QUERIES = 5;
    const SHARE_BONUS_QUERIES = 1;
    const MAX_SHARE_BONUS = 5;
    
    const shareBonus = Math.min(shareCount || 0, MAX_SHARE_BONUS) * SHARE_BONUS_QUERIES;
    const allowedQueries = FREE_BASE_QUERIES + shareBonus;
    const currentQueries = queryCount || 0;
    const remaining = Math.max(0, allowedQueries - currentQueries);
    
    return { 
      allowed: currentQueries < allowedQueries, 
      remaining, 
      isSubscriber: false 
    };
  } catch (error) {
    console.error('Error checking query limit:', error);
    // Default to allowing in case of database errors
    return { allowed: true, remaining: 0, isSubscriber: false };
  }
}

/**
 * Log a query usage for a user
 * @param userId User ID to log usage for
 */
export async function logQueryUsage(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('user_queries').insert([{ user_id: userId }]);
  } catch (error) {
    console.error('Error logging query usage:', error);
  }
}

/**
 * Parse anonymous user cookie to track usage
 * @param req NextRequest object
 * @returns Object with query count from cookie
 */
export function parseAnonCookie(req: NextRequest): { count: number } {
  const cookie = req.cookies.get('rh_qc')?.value;
  const count = cookie ? Number(cookie) || 0 : 0;
  return { count };
}

/**
 * Add anonymous usage cookie to response
 * @param res Response object
 * @param newCount New query count to store
 * @returns Response with cookie added
 */
export function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.append('Set-Cookie', `rh_qc=${newCount}; Path=/; Max-Age=2592000; SameSite=Lax`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Validate API request authentication and enforce rate limits
 * @param req NextRequest to validate
 * @returns Object with user ID and authorized status, or a Response if unauthorized/rate-limited
 */
export async function validateApiAuth(
  req: NextRequest
): Promise<{ userId: string | null; errorResponse: Response | null }> {
  const authHeader = req.headers.get('authorization');
  const userId = decodeJwtSub(authHeader);
  
  // Check authenticated user rate limits
  if (userId) {
    const limit = await checkQueryLimit(userId);
    if (!limit.allowed) {
      const message = limit.isSubscriber
        ? 'Subscription expired. Please renew your subscription to continue.'
        : 'Free query limit reached. Upgrade to continue.';
      
      return {
        userId,
        errorResponse: corsify(req, paymentRequired(message, limit.remaining, limit.isSubscriber))
      };
    }
    
    return { userId, errorResponse: null };
  }
  
  // Handle anonymous users
  const { count: anonCount } = parseAnonCookie(req);
  const ANON_QUERY_LIMIT = 2;
  
  if (anonCount >= ANON_QUERY_LIMIT) {
    return {
      userId: null,
      errorResponse: corsify(
        req,
        paymentRequired('Free query limit reached. Create an account for more searches.', 0, false)
      )
    };
  }
  
  return { userId: null, errorResponse: null };
}
