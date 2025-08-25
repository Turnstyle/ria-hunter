// app/_backend/api/credits/debug/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  // Check authentication
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check DB connection with a quick test
    const dbResult = await supabaseAdmin.rpc('now').single();
    const dbOk = !dbResult.error && !!dbResult.data;

    // Last 4 chars of secrets for debugging (never expose full secrets)
    const secretHints = {
      stripeSecretKey: process.env.STRIPE_SECRET_KEY ? 
        `...${process.env.STRIPE_SECRET_KEY.slice(-4)}` : 'missing',
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ? 
        `...${process.env.STRIPE_WEBHOOK_SECRET.slice(-4)}` : 'missing',
      creditsSecret: process.env.CREDITS_SECRET ? 
        `...${process.env.CREDITS_SECRET.slice(-4)}` : 'missing',
      supabaseUrl: process.env.SUPABASE_URL ? 
        process.env.SUPABASE_URL.replace(/^https?:\/\/([^\/]+).*$/, '$1') : 'missing',
    };

    // Return minimal safe debug info (no full secret values)
    return NextResponse.json({
      ok: dbOk,
      runtime: 'nodejs',
      environment: process.env.NODE_ENV,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
      hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      secretHints,
      welcomeCredits: Number(process.env.WELCOME_CREDITS || 15),
      dbCheck: dbOk ? 'ok' : 'failed',
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('credits_debug_error', { 
      message: (e as Error).message,
      stack: (e as Error).stack
    });
    
    return NextResponse.json({ 
      ok: false, 
      error: String(e?.message),
      hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
      hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      runtime: 'nodejs',
    }, { status: 200 }); // Always return 200 with error info
  }
}
