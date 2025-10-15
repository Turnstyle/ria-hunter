export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { corsHeaders, handleOptionsRequest } from '@/lib/cors'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const fallbackRedirect = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL}/auth/callback`
  : 'http://localhost:3000/auth/callback'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[auth/magic-link] Supabase anon credentials missing')
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase client not configured' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  try {
    const { email, redirectTo } = await req.json()

    if (typeof email !== 'string' || email.trim().length === 0) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const redirectUrl = typeof redirectTo === 'string' && redirectTo.length > 0
      ? redirectTo
      : fallbackRedirect

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectUrl
      }
    })

    if (error) {
      console.error('[auth/magic-link] Failed to send email:', error.message)
      return NextResponse.json({ error: 'Unable to send magic link' }, { status: 400, headers: corsHeaders(req) })
    }

    // Pre-create a user account record if it does not exist yet
    try {
      await supabaseAdmin
        .from('user_accounts')
        .insert({ email: normalizedEmail })
        .onConflict('email')
        .ignore()
    } catch (insertError) {
      console.warn('[auth/magic-link] Could not pre-create user account:', insertError)
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders(req) })
  } catch (error) {
    console.error('[auth/magic-link] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Unexpected error requesting magic link' },
      { status: 500, headers: corsHeaders(req) }
    )
  }
}

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}
