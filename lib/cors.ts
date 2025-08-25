/**
 * Centralized CORS configuration for the RIA Hunter API
 * This module ensures consistent CORS headers across all API routes
 */
import { NextRequest, NextResponse } from 'next/server';

// Define Set of allowed origins for better performance and clarity
const ALLOWED = new Set([
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
]);

// Parse additional origins from environment variable
if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(origin => ALLOWED.add(origin));
}

/**
 * Check if a Vercel preview URL should be allowed
 * This is useful during development and testing on Vercel preview deployments
 */
export function isAllowedPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host.endsWith('.vercel.app') && 
           (host.startsWith('ria-hunter-') || host.startsWith('ria-hunter-app-'));
  } catch {
    return false;
  }
}

/**
 * Generate CORS headers for a request
 * @param req The incoming request
 * @param preflight Whether this is a preflight OPTIONS request
 * @returns Headers object with appropriate CORS headers
 */
export function corsHeaders(req: Request | NextRequest, preflight = false): Headers {
  const origin = req.headers.get('Origin') ?? '';
  const allowOrigin = ALLOWED.has(origin) || 
                     (process.env.NODE_ENV !== 'production' && isAllowedPreviewOrigin(origin)) 
                     ? origin : '';
  
  if (!allowOrigin && origin) {
    console.warn(`CORS: Blocked origin ${origin}`);
  }
  
  const h = new Headers();
  
  // Only set allowed origin if there is one - never use *
  if (allowOrigin) {
    h.set('Access-Control-Allow-Origin', allowOrigin);
  }
  
  h.set('Vary', 'Origin'); // Critical for CDN caching with varying origins
  h.set('Access-Control-Allow-Credentials', 'true');
  h.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-user-id, Accept, X-Request-Id');
  
  if (preflight) {
    h.set('Access-Control-Max-Age', '86400'); // 24 hours for preflight caching
  }
  
  // Debug logging in non-production
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    console.log('CORS Headers:', {
      requestOrigin: origin,
      allowOrigin: h.get('Access-Control-Allow-Origin'),
      credentials: h.get('Access-Control-Allow-Credentials'),
      methods: h.get('Access-Control-Allow-Methods'),
      headers: h.get('Access-Control-Allow-Headers')
    });
  }
  
  return h;
}

/**
 * Create a standard OPTIONS response handler for preflight requests
 * This should be exported as OPTIONS in each route file
 */
export function handleOptionsRequest(req: Request | NextRequest): Response {
  return new Response(null, { 
    status: 204, 
    headers: corsHeaders(req, true) 
  });
}

/**
 * Add CORS headers to an existing response
 * @param req The incoming request
 * @param res The response to add headers to
 * @returns A new response with CORS headers added
 */
export function addCorsHeaders(req: Request | NextRequest, res: Response): Response {
  const headers = corsHeaders(req);
  
  // Copy all existing headers from the response
  for (const [key, value] of res.headers.entries()) {
    headers.set(key, value);
  }
  
  return new Response(res.body, { 
    status: res.status, 
    statusText: res.statusText, 
    headers 
  });
}

/**
 * Create a standard error response with CORS headers
 * @param req The incoming request
 * @param message Error message
 * @param status HTTP status code
 * @returns JSON response with CORS headers
 */
export function corsError(req: Request | NextRequest, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }), 
    { 
      status, 
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json'
      } 
    }
  );
}

/**
 * Debug function to log current CORS configuration
 * Useful during deployment troubleshooting
 */
export function logCorsConfig(): void {
  console.log('CORS Configuration:');
  console.log('Allowed Origins:', [...ALLOWED]);
  console.log('NODE_ENV:', process.env.NODE_ENV);
}
