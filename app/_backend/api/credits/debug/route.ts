// app/_backend/api/credits/debug/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Check authentication
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Return minimal safe debug info (no secret values)
    return NextResponse.json({
      runtime: 'node',
      environment: process.env.NODE_ENV,
      envVars: {
        stripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
        stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        supabaseUrl: Boolean(process.env.SUPABASE_URL),
        supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        creditsSecret: Boolean(process.env.CREDITS_SECRET),
        welcomeCredits: Number(process.env.WELCOME_CREDITS || 15),
      },
      now: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message) }, { status: 500 });
  }
}
