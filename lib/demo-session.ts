import { NextRequest, NextResponse } from 'next/server'

export const DEMO_SEARCHES_ALLOWED = 5
export const SESSION_COOKIE_NAME = 'rh_demo'
export const SESSION_DURATION_HOURS = 24

/**
 * Get the current demo session count from cookie
 */
export function getDemoSession(request: NextRequest): number {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)
  if (!cookie || !cookie.value) return 0
  
  const value = parseInt(cookie.value, 10)
  return isNaN(value) ? 0 : Math.max(0, value)
}

/**
 * Check if demo limit has been reached
 */
export function checkDemoLimit(
  request: NextRequest, 
  isSubscriber: boolean
): { 
  allowed: boolean; 
  searchesUsed: number;
  searchesRemaining: number;
} {
  // Subscribers bypass all limits
  if (isSubscriber) {
    return { 
      allowed: true, 
      searchesUsed: 0, 
      searchesRemaining: -1 // -1 indicates unlimited
    }
  }
  
  const count = getDemoSession(request)
  const remaining = Math.max(0, DEMO_SEARCHES_ALLOWED - count)
  
  return { 
    allowed: count < DEMO_SEARCHES_ALLOWED,
    searchesUsed: count,
    searchesRemaining: remaining
  }
}

/**
 * Create response with updated demo session cookie
 */
export function incrementDemoSession(
  response: NextResponse, 
  currentCount: number
): NextResponse {
  const newCount = currentCount + 1
  
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: newCount.toString(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
    path: '/'
  })
  
  return response
}
