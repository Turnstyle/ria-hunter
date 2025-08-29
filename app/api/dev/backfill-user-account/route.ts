// app/api/dev/backfill-user-account/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const isDevelopment = process.env.NODE_ENV === 'development' || 
  process.env.VERCEL_ENV === 'preview' || 
  process.env.ALLOW_DEV_TOOLS === 'true';

export async function GET(req: NextRequest) {
  // Check environment - only allow in development/preview
  if (!isDevelopment) {
    console.warn('[dev] Attempted to access dev endpoint in production');
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  // Get email from query param
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  try {
    console.log('[dev] Backfilling user account for:', email);
    
    // Check if user exists in user_accounts
    const { data: existingAccount, error: checkError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (checkError) {
      console.error('[dev] Error checking for existing user:', checkError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (existingAccount) {
      return NextResponse.json({
        ok: true,
        message: 'User account already exists',
        user: existingAccount
      });
    }
    
    // Create new user account with default values
    const { data: newAccount, error: createError } = await supabaseAdmin
      .from('user_accounts')
      .insert({
        email: email,
        is_pro: false,
        credits: 15 // Default welcome credits
      })
      .select()
      .single();
    
    if (createError) {
      console.error('[dev] Error creating user account:', createError.message);
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
    }
    
    console.log('[dev] Successfully created user account:', newAccount);
    
    return NextResponse.json({
      ok: true,
      message: 'User account created successfully',
      user: newAccount
    });
    
  } catch (error) {
    console.error('[dev] Unexpected error:', error);
    return NextResponse.json({
      error: 'Unexpected error during backfill',
      details: (error as Error).message
    }, { status: 500 });
  }
}
