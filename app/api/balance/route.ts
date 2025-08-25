import { NextRequest, NextResponse } from 'next/server';
import { ensureAccount, getBalance, grantCredits } from '@/lib/credits';
import { addCorsHeaders, corsError, handleOptionsRequest } from '@/lib/cors';

const WELCOME = Number(process.env.WELCOME_CREDITS ?? 15);

export async function GET(req: NextRequest) {
  const uid = req.cookies.get('uid')?.value || null;
  if (!uid) {
    return corsError(req, 'missing uid', 400);
  }

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

    const balance = await getBalance(uid);
    const response = NextResponse.json({ balance });
    return addCorsHeaders(req, response);
  } catch (error) {
    console.error('Error in balance API:', error);
    return corsError(req, 'Failed to process credits operation', 500);
  }
}

// Handle CORS preflight requests
export const OPTIONS = handleOptionsRequest;