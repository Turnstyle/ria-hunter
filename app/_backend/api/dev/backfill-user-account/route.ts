// app/_backend/api/dev/backfill-user-account/route.ts
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
    // First check if user exists in auth.users
    const { data: authUser, error: authError } = await supabaseAdmin.auth
      .admin.listUsers({
        filters: { email }
      });

    if (authError) {
      console.error('[dev] Error fetching auth user:', authError);
      return NextResponse.json({ error: 'Failed to fetch auth user' }, { status: 500 });
    }

    if (!authUser || !authUser.users || authUser.users.length === 0) {
      return NextResponse.json({ 
        error: 'User not found in auth.users table',
        suggestion: 'User must sign up first before backfilling' 
      }, { status: 404 });
    }

    const user = authUser.users[0];
    
    // Check if user account already exists
    const { data: existingAccount, error: lookupError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('[dev] Error checking for existing account:', lookupError);
      return NextResponse.json({ error: 'Database error checking for existing account' }, { status: 500 });
    }

    if (existingAccount) {
      return NextResponse.json({ 
        message: 'User account already exists',
        account: existingAccount
      });
    }

    // Create new user account
    const { data: newAccount, error: insertError } = await supabaseAdmin
      .from('user_accounts')
      .insert({
        id: user.id,
        email: user.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[dev] Error creating user account:', insertError);
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'User account created successfully',
      account: newAccount
    });
  } catch (err) {
    console.error('[dev] Backfill error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
