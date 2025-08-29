// app/api/balance/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'node:crypto';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WELCOME_CREDITS = Number(process.env.WELCOME_CREDITS ?? 15);
const CREDITS_SECRET = process.env.CREDITS_SECRET;

// Utility functions for the cookie ledger
function createSignature(payload: string): string {
  if (!CREDITS_SECRET) {
    console.error('[credits] Missing CREDITS_SECRET env variable');
    return '';
  }
  return createHmac('sha256', CREDITS_SECRET).update(payload).digest('base64url');
}

function base64UrlEncode(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function verifyCookieLedger(cookie: string | undefined, uid: string): { valid: boolean; credits: number } {
  if (!cookie || !cookie.includes('.')) {
    return { valid: false, credits: 0 };
  }

  try {
    const [payload, signature] = cookie.split('.');
    
    // Verify signature
    const expectedSignature = createSignature(payload);
    if (signature !== expectedSignature) {
      return { valid: false, credits: 0 };
    }

    // Decode payload
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    
    // Verify UID matches
    if (data.uid !== uid) {
      return { valid: false, credits: 0 };
    }

    return { valid: true, credits: data.credits };
  } catch (error) {
    console.error('[credits] Error verifying cookie ledger:', error);
    return { valid: false, credits: 0 };
  }
}

function createCreditsCookie(uid: string, credits: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode({ uid, credits, iat: now });
  const signature = createSignature(payload);
  
  return {
    name: 'rh_credits',
    value: `${payload}.${signature}`,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    domain: '.ria-hunter.app',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  };
}

/**
 * Gets a user's credit balance using the appropriate database function
 * @param userId The user ID to get credits for
 * @returns The user's credit balance, or null if an error occurs
 */
async function getUserCredits(userId: string): Promise<number | null> {
  try {
    // First try using public_get_credits_balance (per requirements)
    const { data: result, error } = await supabaseAdmin.rpc(
      'public_get_credits_balance',
      { p_user_id: userId }
    );
    
    if (!error) {
      return result || 0;
    }
    
    // If public_get_credits_balance fails with "function does not exist", try get_credits_balance
    if (error.code === '42883') {
      console.log('[balance] Function public_get_credits_balance not found, trying get_credits_balance');
      
      const { data: fallbackResult, error: fallbackError } = await supabaseAdmin.rpc(
        'get_credits_balance',
        { p_user_id: userId }
      );
      
      if (!fallbackError) {
        return fallbackResult || 0;
      }
      
      // If get_credits_balance also fails, log the error
      console.error('[balance] Failed to get credits from get_credits_balance:', fallbackError);
    } else {
      console.error('[balance] Failed to get credits from public_get_credits_balance:', error);
    }
    
    return null;
  } catch (err) {
    console.error('[balance] Error getting credits:', err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Get auth client
  const supabaseAuth = createRouteHandlerClient({ cookies });
  
  // Try to get the authenticated user (but don't fail if not authenticated)
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const userId = user?.id;
  const userEmail = user?.email;
  
  // Handle anonymous users - no 401, just return guest credits
  if (!userId || !userEmail) {
    console.log('[balance] No authenticated user, returning guest credits');
    return handleAnonymousUser(req);
  }
  
  try {
    // Try to find user account by email
    const { data: userAccount, error } = await supabaseAdmin
      .from('user_accounts')
      .select('id, is_pro')
      .eq('email', userEmail)
      .maybeSingle();
    
    if (error) {
      // Check if error is "relation does not exist"
      if (error.code === '42P01') {
        console.log('[balance] Table user_accounts does not exist, falling back to cookie');
        return handleCookieFallback(req, userEmail);
      }
      throw error;
    }
    
    if (!userAccount) {
      console.log('[balance] User account not found, falling back to cookie');
      return handleCookieFallback(req, userEmail);
    }
    
    // If user is a subscriber, return 0 credits but isSubscriber: true
    if (userAccount.is_pro) {
      return NextResponse.json({ 
        credits: 0,  // Set to 0 for Pro users per requirement
        balance: 0,  // For legacy compatibility
        isSubscriber: true, 
        source: 'db' 
      }, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Get credits from the database using the appropriate function
    const credits = await getUserCredits(userAccount.id);
    
    // If credits couldn't be retrieved, fall back to cookie
    if (credits === null) {
      console.log('[balance] Could not get credits from database, falling back to cookie');
      return handleCookieFallback(req, userEmail);
    }
    
    // Return successful response with credits, balance, and isSubscriber status
    return NextResponse.json({ 
      credits, 
      balance: credits, // For legacy compatibility
      isSubscriber: false, 
      source: 'db' 
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('[balance] Error:', err);
    return handleCookieFallback(req, userEmail);
  }
}

function handleCookieFallback(req: NextRequest, email?: string): NextResponse {
  const uid = email || req.cookies.get('uid')?.value || 'anonymous';
  
  // Get or initialize cookie-based credits
  const creditsCookie = req.cookies.get('rh_credits')?.value;
  const { valid, credits: existingCredits } = verifyCookieLedger(creditsCookie, uid);
  
  // Use existing credits or initialize with welcome credits
  const credits = valid ? existingCredits : WELCOME_CREDITS;
  console.log('[credits] using cookie ledger, credits:', credits);
  
  // Create standardized response with both balance and credits fields
  const res = NextResponse.json({ 
    balance: credits, 
    credits, 
    isSubscriber: false,
    source: 'cookie'
  });
  
  // Set/refresh the cookie
  res.cookies.set(createCreditsCookie(uid, credits));
  
  return res;
}

/**
 * Handles anonymous users by returning guest credits and ensuring stable guest_id
 */
function handleAnonymousUser(req: NextRequest): NextResponse {
  // Get or create stable guest_id
  let guestId = req.cookies.get('guest_id')?.value;
  const needsNewGuestId = !guestId;
  
  if (needsNewGuestId) {
    // Generate new guest_id
    guestId = randomUUID();
    console.log('[balance] Created new guest_id:', guestId);
  }
  
  // Always return 15 credits for anonymous users (guest default)
  const response = NextResponse.json({ 
    credits: WELCOME_CREDITS, // 15 by default
    balance: WELCOME_CREDITS, // For legacy compatibility
    isSubscriber: false,
    source: 'guest-default'
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    }
  });
  
  // Set guest_id cookie if needed (HttpOnly, Secure, SameSite=Lax, 30 days)
  if (needsNewGuestId && guestId) {
    response.cookies.set({
      name: 'guest_id',
      value: guestId,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: '.ria-hunter.app',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
  }
  
  return response;
}