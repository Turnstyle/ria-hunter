import { NextRequest, NextResponse } from 'next/server'
// Avoid using Node-only clients in Edge runtime
let supabaseAdmin: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  supabaseAdmin = require('@/lib/supabaseAdmin').supabaseAdmin
} catch {
  supabaseAdmin = null
}

/**
 * Middleware to authenticate API routes using Supabase JWT tokens
 * Replaces Auth0 authentication with Supabase Auth
 */
export async function middleware(request: NextRequest) {
  // Only apply to API routes (except webhook endpoints which need raw body)
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Always allow CORS preflight to pass through to route handlers
  if (request.method === 'OPTIONS') {
    return NextResponse.next()
  }

  // Skip auth for webhook endpoints and test endpoints
  const skipAuthPaths = [
    '/api/stripe-webhook',
    '/api/test-env',
    '/api/ria-hunter-waitlist',
    '/api/save-form-data',
    // v1 centralized endpoints handle anonymous + auth internally
    '/api/v1/ria/',
    // Alias to v1 query; allow anonymous to reach handler for free-tier logic
    '/api/ask',
    // Streaming version of ask; allow anonymous
    '/api/ask-stream'
  ]
  
  if (skipAuthPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Extract Authorization header
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  
  try {
    // Validate JWT with Supabase
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 500 })
    }
    const { data: user, error } = await supabaseAdmin.auth.getUser(token)
    
    if (error || !user.user) {
      console.error('Supabase auth error:', error)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.user.id)
    requestHeaders.set('x-user-email', user.user.email || '')

    // Continue with the request
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
}

export const config = {
  matcher: ['/api/:path*']
}