export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ensureAccount, getBalance, grantCredits } from '@/lib/credits';

const WELCOME = Number(process.env.WELCOME_CREDITS ?? 15);

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

    const balance = await getBalance(uid);
    const res = NextResponse.json({ balance });

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
    // TEMPORARY: never block UI; log for diagnosis.
    const msg = String(err?.message || 'unknown');
    console.error('[balance] credits error', { msg, stack: err?.stack });

    const res = NextResponse.json({ balance: null, error: 'credits_unavailable' }, { status: 200 });
    res.headers.set('x-credits-error', msg);
    res.headers.set('x-credits-mode', 'fallback');

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
  }
}