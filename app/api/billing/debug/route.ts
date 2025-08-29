// app/api/billing/debug/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CREDITS_SECRET = process.env.CREDITS_SECRET;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2024-06-20' 
});

export async function GET(req: NextRequest) {
  // Check authentication
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Basic environment check
    const hasStripe = !!process.env.STRIPE_SECRET_KEY;
    const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Test database connection
    let dbStatus = 'unknown';
    try {
      const { data, error } = await supabaseAdmin.rpc('now').single();
      dbStatus = error ? 'error' : 'connected';
    } catch {
      dbStatus = 'error';
    }

    // Test Stripe connection (if configured)
    let stripeStatus = 'not_configured';
    if (hasStripe) {
      try {
        await stripe.customers.list({ limit: 1 });
        stripeStatus = 'connected';
      } catch {
        stripeStatus = 'error';
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      environment: {
        hasStripe,
        hasWebhookSecret,
        hasSupabase,
        hasCreditsSecret: !!CREDITS_SECRET
      },
      services: {
        database: dbStatus,
        stripe: stripeStatus
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'Billing debug check failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
