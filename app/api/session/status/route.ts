import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDemoSession, DEMO_SEARCHES_ALLOWED } from '@/lib/demo-session'
import { corsHeaders, handleOptionsRequest } from '@/lib/cors'

/**
 * Simple JWT decoder to extract user ID
 */
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

/**
 * GET /api/session/status
 * Returns the current session status including searches remaining
 * Works for both authenticated and anonymous users
 */
export async function GET(req: NextRequest) {
  try {
    console.log('[session/status] Request received')
    
    // Check authentication
    const authHeader = req.headers.get('authorization')
    const userId = decodeJwtSub(authHeader)
    
    console.log('[session/status] User ID:', userId || 'anonymous')
    
    // For authenticated users, check subscription status
    if (userId) {
      // Check subscription status
      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .single()
      
      const isSubscriber = subscription && ['trialing', 'active'].includes(subscription.status)
      
      console.log('[session/status] Authenticated user:', { userId, isSubscriber, status: subscription?.status })
      
      if (isSubscriber) {
        // Subscribers have unlimited searches
        return NextResponse.json({
          searchesRemaining: -1, // -1 indicates unlimited
          searchesUsed: 0,
          isSubscriber: true,
          isAuthenticated: true
        }, {
          headers: corsHeaders(req)
        })
      }
      
      // Non-subscriber authenticated users get demo limits
      const demoCount = getDemoSession(req)
      const remaining = Math.max(0, DEMO_SEARCHES_ALLOWED - demoCount)
      
      return NextResponse.json({
        searchesRemaining: remaining,
        searchesUsed: demoCount,
        isSubscriber: false,
        isAuthenticated: true,
        totalAllowed: DEMO_SEARCHES_ALLOWED
      }, {
        headers: corsHeaders(req)
      })
    }
    
    // Anonymous users - use demo session tracking
    const demoCount = getDemoSession(req)
    const remaining = Math.max(0, DEMO_SEARCHES_ALLOWED - demoCount)
    
    console.log('[session/status] Anonymous user:', { demoCount, remaining })
    
    return NextResponse.json({
      searchesRemaining: remaining,
      searchesUsed: demoCount,
      isSubscriber: false,
      isAuthenticated: false,
      totalAllowed: DEMO_SEARCHES_ALLOWED
    }, {
      headers: corsHeaders(req)
    })
    
  } catch (error) {
    console.error('[session/status] Error:', error)
    
    // Return default values on error
    return NextResponse.json({
      searchesRemaining: DEMO_SEARCHES_ALLOWED,
      searchesUsed: 0,
      isSubscriber: false,
      isAuthenticated: false,
      error: 'Failed to get session status'
    }, {
      status: 500,
      headers: corsHeaders(req)
    })
  }
}

/**
 * Handle OPTIONS requests for CORS
 */
export async function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}
