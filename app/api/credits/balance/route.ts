import { NextRequest, NextResponse } from 'next/server'
import { getDemoSession } from '@/lib/demo-session'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { corsHeaders, handleOptionsRequest } from '@/lib/cors'

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

function decodeJwtSub(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const parts = authorizationHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  const token = parts[1]
  const segments = token.split('.')
  if (segments.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return payload?.sub || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  console.log('📊 Balance check request')
  
  const authHeader = request.headers.get('authorization')
  const userId = decodeJwtSub(authHeader)
  
  if (userId) {
    console.log(`📊 Checking balance for user: ${userId}`)
    
    const { data: sub, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()
    
    if (error) {
      console.log('📊 Subscription check error:', error.message)
    }
    
    const isSubscriber = sub?.status === 'active' || sub?.status === 'trialing'
    
    const response = {
      searchesRemaining: -1, // Unlimited for authenticated users
      isSubscriber,
      isAuthenticated: true,
      subscriptionStatus: sub?.status || 'none'
    }
    
    console.log('📊 Authenticated balance response:', response)
    
    return NextResponse.json(response, { headers: corsHeaders(request) })
  }
  
  // Demo user
  const count = getDemoSession(request)
  const remaining = Math.max(0, 5 - count)
  
  const response = {
    searchesRemaining: remaining,
    searchesUsed: count,
    isSubscriber: false,
    isAuthenticated: false,
    demoMode: true
  }
  
  console.log('📊 Demo balance response:', response)
  
  return NextResponse.json(response, { headers: corsHeaders(request) })
}