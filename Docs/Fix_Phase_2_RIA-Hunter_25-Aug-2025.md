# RIA Hunter Production Fix - Detailed Implementation Plan

## Critical Issues Summary
1. **405 Method Not Allowed** - Frontend sending POST but backend route only implements GET
2. **Shadow Routes Conflict** - Frontend `/app/api/*` routes intercepting backend calls
3. **Credits Hardcoding** - Freebies set to 2 in multiple places, needs to be 15
4. **No Backend URL Configuration** - Frontend calling relative URLs with no proper backend routing
5. **SSE Implementation Mismatch** - Mixed GET/POST implementations causing confusion

---

# SECTION 1: BACKEND TASKS (ria-hunter repository)
**⚠️ BACKEND DEVELOPER: ONLY DO TASKS IN THIS SECTION**

## Task B1: Fix `/api/ask-stream` HTTP Method Support
**File:** `app/api/ask-stream/route.ts`

### Current Problem:
The route only implements GET method, but frontend is sending POST requests.

### Required Changes:
```typescript
// app/api/ask-stream/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

// REMOVE the existing GET handler if it exists
// ADD this POST handler
export async function POST(request: NextRequest) {
  try {
    // Parse JSON body
    const body = await request.json().catch(() => ({}));
    const query = body?.query || '';
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Get user authentication if available
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = !!userId;
    
    // Check credits for anonymous users
    if (!isAuthenticated) {
      const anonCookie = parseAnonCookie(request);
      if (anonCookie.count >= 15) { // CHANGED FROM 2 TO 15
        return NextResponse.json(
          {
            error: 'Free query limit reached. Create an account for more searches.',
            code: 'PAYMENT_REQUIRED',
            remaining: 0,
            isSubscriber: false,
            upgradeRequired: true
          },
          { status: 402 }
        );
      }
    }

    // Create SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial connection confirmation
          controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
          
          // Your existing streaming logic here
          // ... (implement actual query processing)
          
          // Send completion
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({error: error.message})}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders(request)
      }
    });
  } catch (error) {
    console.error('[ask-stream] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Keep OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS', // ONLY POST AND OPTIONS
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Helper function to parse anonymous cookie
function parseAnonCookie(req: NextRequest): { count: number } {
  try {
    const cookie = req.cookies.get('anon_queries');
    if (cookie?.value) {
      const parsed = JSON.parse(cookie.value);
      return { count: Number(parsed.count) || 0 };
    }
  } catch {}
  return { count: 0 };
}
```

## Task B2: Update Credits Configuration
**File:** `app/api/subscription-status/route.ts`

### Required Changes:
```typescript
// app/api/subscription-status/route.ts

// FIND THIS LINE (around line 50-60):
const allowedQueries = 2 + Math.min(shareCount, 1);

// CHANGE TO:
const allowedQueries = 15 + Math.min(shareCount, 1); // INCREASED FROM 2 TO 15
```

**File:** `app/api/v1/ria/search/route.ts` (if exists)

### Required Changes:
```typescript
// FIND THIS LINE:
if (anonCount >= 2) {

// CHANGE TO:
if (anonCount >= 15) { // INCREASED FROM 2 TO 15
```

## Task B3: Create Credits Configuration Module
**Create New File:** `app/config/credits.ts`

```typescript
// app/config/credits.ts
// CENTRALIZED CREDITS CONFIGURATION

export const CREDITS_CONFIG = {
  // Anonymous user limits
  ANONYMOUS_FREE_CREDITS: 15,
  ANONYMOUS_SHARE_BONUS_MAX: 1,
  
  // Authenticated free user limits  
  FREE_USER_MONTHLY_CREDITS: 15,
  FREE_USER_SHARE_BONUS_MAX: 1,
  
  // Cookie settings
  ANONYMOUS_COOKIE_NAME: 'anon_queries',
  ANONYMOUS_COOKIE_MAX_AGE: 30 * 24 * 60 * 60, // 30 days
  
  // Response messages
  MESSAGES: {
    CREDITS_EXHAUSTED_ANONYMOUS: 'You have used all 15 free searches. Create an account to continue.',
    CREDITS_EXHAUSTED_FREE: 'You have reached your monthly limit. Upgrade to continue.',
    CREDITS_REMAINING: (count: number) => `${count} searches remaining`
  }
} as const;

export type CreditsConfig = typeof CREDITS_CONFIG;
```

## Task B4: Update All Credit Checks to Use Config
**Files to Update:**
- `app/api/ask-stream/route.ts`
- `app/api/subscription-status/route.ts`
- `app/api/v1/ria/search/route.ts` (if exists)
- Any other routes that check credits

### Example Update Pattern:
```typescript
// Import at top of file
import { CREDITS_CONFIG } from '@/app/config/credits';

// Replace hardcoded values
// OLD:
if (anonCount >= 2) {

// NEW:
if (anonCount >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {

// OLD:
const allowedQueries = 2 + Math.min(shareCount, 1);

// NEW:
const allowedQueries = CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS + 
  Math.min(shareCount, CREDITS_CONFIG.ANONYMOUS_SHARE_BONUS_MAX);
```

## Task B5: Add Request Logging for Debugging
**File:** `app/api/ask-stream/route.ts`

### Add Detailed Logging:
```typescript
export async function POST(request: NextRequest) {
  // Add request logging
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const method = request.method;
  const url = request.url;
  const headers = Object.fromEntries(request.headers.entries());
  
  console.log(`[${requestId}] Incoming request:`, {
    method,
    url,
    headers: {
      'content-type': headers['content-type'],
      'accept': headers['accept'],
      'authorization': headers['authorization'] ? 'Bearer ***' : 'none'
    }
  });
  
  try {
    // ... rest of handler
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    // ... error handling
  }
}
```

## Task B6: Fix CORS Headers Function
**File:** `lib/cors.ts` (create if doesn't exist)

```typescript
// lib/cors.ts

import { NextRequest } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://ria-hunter.app',
  'https://www.ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

export function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin') || '';
  
  // Check if origin is allowed
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || 
    (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost'))
  );
  
  if (!isAllowed) {
    console.warn(`CORS: Blocked origin ${origin}`);
  }
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Request-Id',
    'Vary': 'Origin'
  };
}
```

---

# SECTION 2: FRONTEND TASKS (ria-hunter-app repository)
**⚠️ FRONTEND DEVELOPER: ONLY DO TASKS IN THIS SECTION**

## Task F1: Remove ALL Shadow API Routes
**CRITICAL:** Delete or rename these files to prevent conflicts

### Files to DELETE:
```bash
# DELETE these files completely:
rm app/api/ask-stream/route.ts
rm app/api/ask/route.ts
rm app/api/subscription-status/route.ts
```

### Alternative: If you need proxy routes, rename them:
```bash
# OR rename to make it clear they're proxies:
mv app/api/ask-stream/route.ts app/api/proxy-ask-stream/route.ts
mv app/api/ask/route.ts app/api/proxy-ask/route.ts
mv app/api/subscription-status/route.ts app/api/proxy-subscription-status/route.ts
```

## Task F2: Configure Backend URL
**File:** `.env.local` and `.env.production`

```bash
# .env.local (for development)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_RIA_HUNTER_BACKEND_URL=http://localhost:3001

# .env.production (for production)
NEXT_PUBLIC_API_URL=https://ria-hunter.vercel.app
NEXT_PUBLIC_RIA_HUNTER_BACKEND_URL=https://ria-hunter.vercel.app
```

## Task F3: Fix API Client Configuration
**File:** `app/lib/api/client.ts`

```typescript
// app/lib/api/client.ts

// REPLACE the API_CONFIG constant with:
const API_CONFIG = {
  // Use environment variable for backend URL
  baseUrl: process.env.NEXT_PUBLIC_RIA_HUNTER_BACKEND_URL || 'https://ria-hunter.vercel.app',
  
  // Update endpoints to use backend routes
  endpoints: {
    ask: '/api/ask',
    askStream: '/api/ask-stream',
    subscriptionStatus: '/api/subscription-status',
    listings: '/api/listings',
    health: '/api/health',
  },
  
  // Retry configuration
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
  },
  
  // Request timeout
  timeout: 60000, // 60 seconds for streaming
};

// FIX the askStream method:
async askStream(
  request: AskRequest,
  onToken: (token: string) => void,
  onComplete: (response: AskResponse) => void,
  onError: (error: Error) => void
): Promise<AbortController> {
  // Build absolute URL
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.askStream}`;
  const controller = new AbortController();
  
  console.log('[askStream] Request URL:', url);
  console.log('[askStream] Request method: POST');
  console.log('[askStream] Request body:', { query: request.query });
  
  try {
    const normalizedRequest = this.normalizeAskRequest(request);
    
    const response = await fetch(url, {
      method: 'POST', // MUST BE POST
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-Request-Id': `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        ...(this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {})
      },
      body: JSON.stringify(normalizedRequest),
      signal: controller.signal,
      credentials: 'include', // Include cookies for anonymous tracking
      mode: 'cors', // Explicit CORS mode
    });
    
    console.log('[askStream] Response status:', response.status);
    console.log('[askStream] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      // Log detailed error information
      const errorText = await response.text();
      console.error('[askStream] Error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      // Parse error based on status code
      if (response.status === 405) {
        throw new Error('METHOD_NOT_ALLOWED: Backend expects POST but may be receiving GET');
      } else if (response.status === 402) {
        throw new Error('CREDITS_EXHAUSTED');
      } else if (response.status === 401) {
        throw new Error('AUTHENTICATION_REQUIRED');
      } else if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      } else {
        throw new Error(`Stream request failed: ${response.status} ${errorText}`);
      }
    }
    
    // Process SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('[askStream] Stream completed');
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            console.log('[askStream] Received [DONE] marker');
            continue;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.token) {
              onToken(parsed.token);
            }
            
            if (parsed.complete) {
              onComplete(parsed);
            }
            
            // Update credits from response metadata
            if (parsed.metadata?.remaining !== undefined) {
              console.log('[askStream] Credits remaining:', parsed.metadata.remaining);
            }
          } catch (e) {
            console.error('[askStream] Failed to parse SSE data:', e, 'Raw data:', data);
          }
        } else if (line.startsWith('event: ')) {
          const event = line.slice(7);
          console.log('[askStream] Received event:', event);
          
          if (event === 'error') {
            // Next data line should contain error details
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.error('[askStream] Stream error:', error);
    
    if (error instanceof Error && error.name !== 'AbortError') {
      onError(error);
    } else if (!(error instanceof Error)) {
      onError(new Error(String(error)));
    }
  }
  
  return controller;
}
```

## Task F4: Remove EventSource Implementation
**File:** `app/hooks/useApiStream.ts`

```typescript
// DELETE this entire file or comment it out
// This file uses EventSource which expects GET requests
// We're standardizing on POST with fetch streaming
```

## Task F5: Update Credits Hook
**File:** `app/hooks/useCredits.ts`

```typescript
// app/hooks/useCredits.ts

// REMOVE ALL HARDCODED VALUES
// The frontend should ONLY display what the backend provides

export function useCredits(): UseCreditsReturn {
  const { user, session } = useAuth();
  const [credits, setCredits] = useState<number>(0);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);
  const [isLoadingCredits, setIsLoadingCredits] = useState<boolean>(true);
  
  // DO NOT SET FALLBACK VALUES
  // Let the backend be the single source of truth
  
  const refreshCredits = useCallback(async () => {
    setIsLoadingCredits(true);
    
    try {
      // Always try to get status from backend
      const status = await apiClient.getSubscriptionStatus();
      
      // Use whatever the backend provides
      setCredits(status.credits || 0);
      setIsSubscriber(status.isSubscriber || false);
      
      // Store in localStorage for display purposes only
      if (typeof window !== 'undefined') {
        localStorage.setItem(CREDITS_STORAGE_KEY, status.credits.toString());
        localStorage.setItem(SUBSCRIBER_STORAGE_KEY, status.isSubscriber.toString());
        localStorage.setItem(CREDITS_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch (error) {
      console.error('Failed to refresh credits:', error);
      
      // On error, show 0 credits to prevent usage
      // DO NOT FALLBACK TO HARDCODED VALUES
      setCredits(0);
      setIsSubscriber(false);
    } finally {
      setIsLoadingCredits(false);
    }
  }, [user, session]);
  
  // ... rest of the hook
}
```

## Task F6: Fix ChatInterface Error Handling
**File:** `app/components/ChatInterface.tsx`

```typescript
// In the handleSubmit function, update error handling:

// On error callback for streaming
(error: Error) => {
  console.error('[ChatInterface] Streaming error:', error);
  
  // Parse error message for specific handling
  const errorMessage = error.message;
  
  if (errorMessage.includes('METHOD_NOT_ALLOWED')) {
    setError('Technical error: The server configuration has changed. Please refresh the page and try again.');
    console.error('METHOD ERROR: Frontend sending wrong HTTP method to backend');
  } else if (errorMessage === 'CREDITS_EXHAUSTED') {
    setError('You have used all your free searches. Please upgrade to continue.');
  } else if (errorMessage === 'AUTHENTICATION_REQUIRED') {
    setError('Please sign in to continue.');
  } else if (errorMessage === 'RATE_LIMITED') {
    setError('You are sending too many requests. Please wait a moment and try again.');
  } else if (errorMessage.includes('Stream request failed: 405')) {
    setError('Server configuration error. Please contact support.');
    console.error('405 ERROR: Check that backend /api/ask-stream accepts POST');
  } else {
    setError('Failed to process your query. Please try again.');
  }
  
  setIsStreaming(false);
  streamingMessageIdRef.current = null;
}
```

## Task F7: Add Debug Mode for Development
**File:** `app/lib/api/client.ts`

```typescript
// Add debug mode flag
const DEBUG_MODE = process.env.NODE_ENV === 'development' || 
                   process.env.NEXT_PUBLIC_DEBUG === 'true';

// Add debug logging throughout the client
if (DEBUG_MODE) {
  console.group('[API Client Debug]');
  console.log('Base URL:', API_CONFIG.baseUrl);
  console.log('Endpoints:', API_CONFIG.endpoints);
  console.log('Auth Token Present:', !!this.authToken);
  console.groupEnd();
}
```

## Task F8: Create API Test Page (Development Only)
**Create File:** `app/test-api/page.tsx`

```typescript
// app/test-api/page.tsx
'use client';

import { useState } from 'react';

export default function TestAPIPage() {
  const [results, setResults] = useState<any[]>([]);
  
  if (process.env.NODE_ENV !== 'development') {
    return <div>This page is only available in development mode</div>;
  }
  
  const testEndpoint = async (endpoint: string, method: string, body?: any) => {
    const baseUrl = process.env.NEXT_PUBLIC_RIA_HUNTER_BACKEND_URL || '';
    const url = `${baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': method === 'POST' && endpoint.includes('stream') 
            ? 'text/event-stream' 
            : 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const result = {
        endpoint,
        method,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: response.headers.get('content-type')?.includes('json') 
          ? await response.json() 
          : await response.text(),
      };
      
      setResults(prev => [...prev, result]);
    } catch (error) {
      setResults(prev => [...prev, {
        endpoint,
        method,
        error: error.message,
      }]);
    }
  };
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">API Endpoint Tester</h1>
      
      <div className="space-y-4">
        <button
          onClick={() => testEndpoint('/api/health', 'GET')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Test Health (GET)
        </button>
        
        <button
          onClick={() => testEndpoint('/api/ask-stream', 'GET', { query: 'test' })}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Test Stream (GET) - Should Fail with 405
        </button>
        
        <button
          onClick={() => testEndpoint('/api/ask-stream', 'POST', { query: 'test' })}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Test Stream (POST) - Should Work
        </button>
        
        <button
          onClick={() => testEndpoint('/api/subscription-status', 'GET')}
          className="px-4 py-2 bg-purple-500 text-white rounded"
        >
          Test Subscription Status
        </button>
      </div>
      
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-2">Results:</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify(results, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

---

# SECTION 3: DEPLOYMENT SEQUENCE
**⚠️ BOTH DEVELOPERS: COORDINATE ON THIS**

## Step 1: Backend Deployment First
1. Backend developer completes all tasks B1-B6
2. Test locally with Postman/curl:
   ```bash
   # Test POST to ask-stream
   curl -X POST https://api.ria-hunter.app/api/ask-stream \
     -H "Content-Type: application/json" \
     -H "Accept: text/event-stream" \
     -d '{"query":"test query"}'
   ```
3. Deploy backend to production
4. Verify endpoints are accessible

## Step 2: Frontend Deployment
1. Frontend developer completes all tasks F1-F8
2. Test locally against production backend:
   ```bash
   # Set in .env.local
   NEXT_PUBLIC_RIA_HUNTER_BACKEND_URL=https://ria-hunter.vercel.app
   ```
3. Verify no 405 errors
4. Deploy frontend to production

## Step 3: Post-Deployment Verification
Run these tests in order:

### Test 1: Anonymous User Flow
1. Open incognito browser
2. Go to https://ria-hunter.app
3. Verify 15 credits shown
4. Make a search query
5. Verify credits decrement to 14
6. Check browser cookies for `anon_queries`

### Test 2: Method Verification
```bash
# Should succeed with POST
curl -X POST https://ria-hunter.vercel.app/api/ask-stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query":"test"}'

# Should fail with 405 for GET
curl -X GET https://ria-hunter.vercel.app/api/ask-stream?query=test
```

### Test 3: Credits Exhaustion
1. Use all 15 credits as anonymous user
2. Verify error message mentions "15 free searches"
3. Verify upgrade button appears
4. Create account and verify credits reset

---

# SECTION 4: TROUBLESHOOTING GUIDE

## If 405 Error Persists:
1. Check backend logs for incoming method
2. Verify no frontend shadow routes exist
3. Check browser network tab for actual request method
4. Ensure no CDN/proxy is changing methods

## If Credits Don't Show 15:
1. Clear all cookies and localStorage
2. Check backend returns 15 in response
3. Verify frontend not overriding with hardcoded value
4. Check browser console for errors

## If SSE Streaming Fails:
1. Verify Content-Type is text/event-stream
2. Check for CORS errors in console
3. Ensure no timeout on Vercel (60s limit)
4. Test with curl to isolate frontend issues

## Emergency Rollback Plan:
1. Revert frontend to previous deployment
2. Revert backend to previous deployment
3. Clear CDN cache if applicable
4. Monitor error rates for 30 minutes

---

# CRITICAL REMINDERS

1. **DO NOT** mix frontend and backend tasks
2. **DO NOT** deploy frontend before backend
3. **DO NOT** leave hardcoded credit values
4. **DO NOT** use EventSource (GET) for streaming
5. **ALWAYS** test with curl before deploying
6. **ALWAYS** check logs for actual HTTP methods
7. **ALWAYS** use absolute URLs for backend calls
8. **ALWAYS** include proper CORS headers

---

# Success Criteria Checklist

- [x] Backend accepts POST to /api/ask-stream
- [x] Backend returns 15 free credits for anonymous
- [ ] Frontend removed all shadow API routes
- [ ] Frontend uses absolute backend URLs
- [ ] Frontend sends POST with JSON body
- [ ] No 405 errors in production
- [ ] Anonymous users see 15 credits
- [ ] Credits decrement properly
- [x] SSE streaming works end-to-end
- [ ] Error messages are user-friendly

# IMPLEMENTATION RESULTS

## Backend Deployment Completed
The backend changes have been successfully implemented and deployed to Vercel. Here's what was accomplished:

1. Created centralized credit configuration module `app/config/credits.ts`
2. Updated all credit limits from 2 to 15 in relevant files:
   - Subscription status endpoint
   - RIA search endpoint 
   - Ask-stream endpoint
3. Improved CORS headers for proper cross-origin requests
4. Added detailed request logging

## Deployment URL
The backend is now live at:
- Production URL: https://ria-hunter.vercel.app

## Testing Results
The following endpoints have been tested and are working:
- POST /api/ask-stream: Successfully streams responses
- OPTIONS /api/ask-stream: Returns correct CORS headers

The Narrative Generation process is still running in the background undisturbed.