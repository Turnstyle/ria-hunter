import { NextRequest, NextResponse } from 'next/server'

// Force Node.js runtime to avoid Edge runtime limitations
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Proxy endpoint to maintain backward compatibility with frontend
 * Forwards requests to the v1 API endpoint at /api/v1/ria/funds/summary/[cik]/
 */

export async function OPTIONS(request: NextRequest) {
  // Forward to v1 endpoint
  const id = request.nextUrl.pathname.split('/').pop()
  const url = new URL(`/api/v1/ria/funds/summary/${id}`, request.url)
  
  return fetch(url.toString(), {
    method: 'OPTIONS',
    headers: request.headers,
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    
    // Construct URL to v1 endpoint
    const url = new URL(`/api/v1/ria/funds/summary/${id}`, request.url)
    
    // Copy query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })
    
    // Forward the request to v1 endpoint
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: request.headers,
    })
    
    // Return the response from v1 endpoint
    const data = await response.json()
    return NextResponse.json(data, { 
      status: response.status,
      headers: response.headers 
    })
    
  } catch (error) {
    console.error('funds/summary proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' }, 
      { status: 500 }
    )
  }
}
