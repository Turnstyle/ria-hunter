import { NextRequest, NextResponse } from 'next/server';
import { ensureAccount, getBalance, grantCredits } from '@/lib/credits';

const WELCOME = Number(process.env.WELCOME_CREDITS ?? 15);

export async function GET(req: NextRequest) {
  const uid = req.cookies.get('uid')?.value || null;
  if (!uid) return new NextResponse('Missing uid', { status: 400 });

  await ensureAccount(uid);

  // One-time welcome grant; idempotent on user
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
  return NextResponse.json({ balance });
}
