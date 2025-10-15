export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { corsHeaders, handleOptionsRequest } from '@/lib/cors'

function extractToken(header: string | null): string | null {
  if (!header) return null
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

export async function POST(req: NextRequest) {
  const token = extractToken(req.headers.get('authorization'))

  if (!token) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 401, headers: corsHeaders(req) })
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !data.user) {
      console.error('[auth/sync] Failed to fetch user from token:', error?.message)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders(req) })
    }

    const { id, email } = data.user
    if (!email) {
      return NextResponse.json({ error: 'User email is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const normalizedEmail = email.toLowerCase()

    const { data: existingAccount, error: loadError } = await supabaseAdmin
      .from('user_accounts')
      .select('id, email')
      .eq('id', id)
      .maybeSingle()

    if (loadError) {
      console.error('[auth/sync] Failed to load existing account:', loadError.message)
      return NextResponse.json({ error: 'Unable to sync user account' }, { status: 500, headers: corsHeaders(req) })
    }

    if (!existingAccount) {
      const { error: insertError } = await supabaseAdmin
        .from('user_accounts')
        .insert({ id, email: normalizedEmail })

      if (insertError) {
        console.error('[auth/sync] Failed to insert user account:', insertError.message)
        return NextResponse.json({ error: 'Unable to sync user account' }, { status: 500, headers: corsHeaders(req) })
      }
    } else if (existingAccount.email?.toLowerCase() !== normalizedEmail) {
      const { error: updateError } = await supabaseAdmin
        .from('user_accounts')
        .update({ email: normalizedEmail })
        .eq('id', id)

      if (updateError) {
        console.error('[auth/sync] Failed to update account email:', updateError.message)
      }
    }

    const { data: accountRecord, error: accountError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (accountError) {
      console.error('[auth/sync] Failed to fetch account record:', accountError.message)
    }

    const { data: subscriptionRecord, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', id)
      .maybeSingle()

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      console.error('[auth/sync] Failed to fetch subscription record:', subscriptionError.message)
    }

    let computedBalance: number | null = null
    try {
      const { data: creditsBalance, error: creditsError } = await supabaseAdmin
        .rpc('get_credits_balance', { p_user_id: id })

      if (!creditsError && typeof creditsBalance === 'number') {
        computedBalance = creditsBalance
      }
    } catch (creditsErr) {
      console.warn('[auth/sync] Credits balance lookup failed:', creditsErr)
    }

    const subscriptionStatus = subscriptionRecord?.status ?? accountRecord?.subscription_status ?? null
    const currentPeriodEnd = subscriptionRecord?.current_period_end ?? accountRecord?.current_period_end ?? null
    const stripeCustomerId = accountRecord?.stripe_customer_id ?? subscriptionRecord?.stripe_customer_id ?? null
    const stripeSubscriptionId = accountRecord?.stripe_subscription_id ?? subscriptionRecord?.stripe_subscription_id ?? null

    const canonicalAccount = {
      id,
      email: normalizedEmail,
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionStatus,
      plan: accountRecord?.plan ?? null,
      currentPeriodEnd,
      isSubscriber: subscriptionStatus ? ['trialing', 'active', 'past_due'].includes(subscriptionStatus) : Boolean(accountRecord?.is_subscriber),
      balance: computedBalance ?? accountRecord?.balance ?? 0,
      createdAt: accountRecord?.created_at ?? null,
      updatedAt: accountRecord?.updated_at ?? null
    }

    return NextResponse.json({
      user: {
        id,
        email: normalizedEmail
      },
      account: canonicalAccount
    }, { headers: corsHeaders(req) })
  } catch (error) {
    console.error('[auth/sync] Unexpected error:', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500, headers: corsHeaders(req) })
  }
}

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}
