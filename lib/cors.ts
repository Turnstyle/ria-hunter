/**
 * Centralized CORS configuration for the RIA Hunter API
 * This module ensures consistent CORS headers across all API routes
 */
import { NextRequest, NextResponse } from 'next/server';

// Default allowed origins if none specified in environment variables
const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

// Parse CORS_ORIGINS from environment variable
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Use environment variable list if available, otherwise use defaults
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0
  ? ALLOWED_ORIGINS
  : DEFAULT_ALLOWED_ORIGINS;

// Allow all origins in development mode only
const ALLOW_ALL_ORIGINS = process.env.ALLOW_ALL_ORIGINS === 'true' && process.env.NODE_ENV !== 'production';

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
 * Determine the appropriate origin to use based on the request's origin header
 */
export function getAllowedOriginFromRequest(req: NextRequest): string | undefined {
  // If ALLOW_ALL_ORIGINS is true (dev/test only), return the requesting origin
  if (ALLOW_ALL_ORIGINS) {
    return req.headers.get('origin') || undefined;
  }
  
  const origin = req.headers.get('origin') || undefined;
  
  // Check if origin is in our allowed list or is a Vercel preview URL
  if (origin && (
    EFFECTIVE_ALLOWED_ORIGINS.includes(origin) || 
    isAllowedPreviewOrigin(origin)
  )) {
    return origin;
  }
  
  // Otherwise, default to the first allowed origin (for static responses)
  return EFFECTIVE_ALLOWED_ORIGINS[0];
}

/**
 * Add CORS headers to a Response
 * @param req The incoming NextRequest
 * @param res The Response to add CORS headers to
 * @param preflight Whether this is a preflight OPTIONS request
 * @returns A new Response with CORS headers added
 */
export function corsify(req: NextRequest, res: Response, preflight = false): Response {
  const headers = new Headers(res.headers);
  const origin = getAllowedOriginFromRequest(req) || EFFECTIVE_ALLOWED_ORIGINS[0];
  
  if (!origin) {
    console.warn(`CORS: Blocked origin ${req.headers.get('origin')}`);
  }
  
  // Set CORS headers
  headers.set('Access-Control-Allow-Origin', origin || '');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin'); // Important for CDN caching
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Request-Id');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  // Set longer cache time for preflight requests
  if (preflight) {
    headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Log CORS headers for debugging
  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Credentials': headers.get('Access-Control-Allow-Credentials'),
      'Access-Control-Allow-Methods': headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': headers.get('Access-Control-Allow-Headers')
    });
  }

  return new Response(res.body, { 
    status: res.status, 
    statusText: res.statusText, 
    headers 
  });
}

/**
 * Handle OPTIONS preflight requests
 * This is a helper function to be used in route.ts files
 */
export function handleCorsOptions(req: NextRequest): Response {
  return corsify(req, new Response(null, { status: 204 }), true);
}

/**
 * Debug function to log current CORS configuration
 * Useful during deployment troubleshooting
 */
export function logCorsConfig(): void {
  console.log('CORS Configuration:');
  console.log('ALLOW_ALL_ORIGINS:', ALLOW_ALL_ORIGINS);
  console.log('EFFECTIVE_ALLOWED_ORIGINS:', EFFECTIVE_ALLOWED_ORIGINS);
}
