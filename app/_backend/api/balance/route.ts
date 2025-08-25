// app/_backend/api/balance/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
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

export async function GET(req: NextRequest) {
  // Get auth client
  const supabaseAuth = createRouteHandlerClient({ cookies });
  
  // Try to get the authenticated user's email
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const userEmail = user?.email;
  
  if (!userEmail) {
    console.log('[balance] No authenticated user, falling back to cookie');
    return handleCookieFallback(req);
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
    
    // If user is a subscriber, return unlimited credits
    if (userAccount.is_pro) {
      return NextResponse.json({ 
        credits: null, 
        balance: null, 
        isSubscriber: true, 
        source: 'db' 
      });
    }
    
    // Try to get credits from the database
    try {
      // Get user credits from credit_transactions
      const { data: result, error: creditsError } = await supabaseAdmin.rpc(
        'get_credits_balance',
        { p_user_id: userAccount.id }
      );
      
      if (creditsError) {
        // If function doesn't exist, fall back to cookie
        if (creditsError.code === '42883') {
          console.log('[balance] Function get_credits_balance does not exist, falling back to cookie');
          return handleCookieFallback(req, userEmail);
        }
        throw creditsError;
      }
      
      const credits = result || 0;
      
      return NextResponse.json({ 
        credits, 
        balance: credits, 
        isSubscriber: false, 
        source: 'db' 
      });
    } catch (creditsErr) {
      console.error('[balance] Error getting credits:', creditsErr);
      return handleCookieFallback(req, userEmail);
    }
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