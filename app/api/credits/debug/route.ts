// app/api/credits/debug/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  if (!process.env.CREDITS_SECRET || providedSecret !== process.env.CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      env: {
        hasCreditsSecret: !!process.env.CREDITS_SECRET,
        hasWelcomeCredits: !!process.env.WELCOME_CREDITS,
        welcomeCredits: process.env.WELCOME_CREDITS || '15'
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'Credits debug check failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}