import { NextRequest, NextResponse } from 'next/server';
import { ensureAccount, getBalance, grantCredits, idem } from '@/lib/credits';

const WELCOME = Number(process.env.WELCOME_CREDITS ?? 15); // optional initial grant

function userIdFrom(req: NextRequest) {
  // use auth user id if present; else anon cookie
  return req.cookies.get('uid')?.value || null;
}

export async function GET(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId) return new NextResponse('No identity', { status: 400 }); // shouldn't happen after middleware

  await ensureAccount(userId);

  // optional one‑time welcome grant
  if (WELCOME > 0) {
    await grantCredits({
      userId,
      amount: WELCOME,
      source: 'migration',
      idempotencyKey: `welcome:${userId}`, // prevents duplicates
      refType: 'welcome',
      refId: 'v1',
    });
  }

  const balance = await getBalance(userId);
  return NextResponse.json({ balance });
}
