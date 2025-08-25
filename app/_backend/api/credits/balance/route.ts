// app/_backend/api/credits/balance/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureAccount, getBalance, grantCredits } from '@/lib/credits';

const WELCOME = Number(process.env.WELCOME_CREDITS ?? 15);
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
 * Get user subscription status
 */
async function getSubscriptionStatus(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_accounts')
      .select('is_subscriber')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[credits] Error fetching subscription status:', error);
      return false;
    }

    return Boolean(data?.is_subscriber);
  } catch (err) {
    console.error('[credits] Error in getSubscriptionStatus:', err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  let uid = req.cookies.get('uid')?.value || null;
  let minted = false;
  if (!uid) { uid = randomUUID(); minted = true; }

  try {
    await ensureAccount(uid);

    if (WELCOME > 0) {
      await grantCredits({
        userId: uid,
        amount: WELCOME,
        source: 'migration',
        idempotencyKey: `welcome:${uid}`,
        refType: 'welcome',
        refId: 'v1',
      });
    }

    const [balance, isSubscriber] = await Promise.all([
      getBalance(uid),
      getSubscriptionStatus(uid)
    ]);
    
    if (balance === null || balance === undefined) {
      throw new Error('balance_null');
    }
    
    const res = NextResponse.json({ 
      balance, 
      credits: balance, // For backward compatibility
      isSubscriber 
    });

    if (minted) {
      res.cookies.set({
        name: 'uid',
        value: uid,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        domain: '.ria-hunter.app',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  } catch (err: any) {
    console.error('[credits] balance error:', err?.message || String(err));
    
    try {
      // Fall back to cookie ledger
      const creditsCookie = req.cookies.get('rh_credits')?.value;
      const { valid, credits: existingCredits } = verifyCookieLedger(creditsCookie, uid);
      
      // Use existing credits or initialize with welcome credits
      const credits = valid ? existingCredits : WELCOME;
      
      const res = NextResponse.json({ 
        balance: credits, 
        credits, // For backward compatibility
        isSubscriber: false,
      });
      
      // Set/refresh the cookie
      res.cookies.set(createCreditsCookie(uid, credits));
      
      if (minted) {
        res.cookies.set({
          name: 'uid',
          value: uid!,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          domain: '.ria-hunter.app',
          maxAge: 60 * 60 * 24 * 365,
        });
      }
      
      return res;
    } catch (fallbackErr) {
      // Last resort - return empty but valid response
      console.error('[credits] cookie fallback error:', fallbackErr);
      return NextResponse.json({ 
        balance: null, 
        credits: null, 
        isSubscriber: false, 
        error: 'credits_unavailable' 
      });
    }
  }
}
