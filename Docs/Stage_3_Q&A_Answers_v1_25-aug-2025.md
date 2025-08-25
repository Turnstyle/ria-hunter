# Stage 3 Q&A Answers

## API/ask-stream Methods
The `/api/ask-stream` handler is implemented in `app/api/ask-stream/route.ts` and correctly accepts POST requests and returns streaming responses with the `text/event-stream` content type.

```typescript
export async function POST(request: NextRequest) {
  // ...processing logic...
  
  const response = new Response(sse, {
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
  
  // ...additional logic...
  return response;
}
```

The method definitions in `app/api/ask-stream/route.ts` include:
- `OPTIONS` - Handles preflight requests
- `POST` - Processes streaming queries and returns events

## Preflight Responses
For Origin: `https://www.ria-hunter.app`, the OPTIONS response for `/api/ask-stream` returns:

- Status: 204 No Content
- Headers:
  - `Access-Control-Allow-Origin: https://www.ria-hunter.app`
  - `Vary: Origin`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Request-Id`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Credentials: true`
  - `Access-Control-Max-Age: 86400`

The OPTIONS response for `/api/ask` follows the same pattern, with identical headers.

## CORS Helper
The CORS implementation is centralized in `lib/cors.ts`. It includes an explicit allowlist and does not use wildcard (*) when credentials are used:

```typescript
// Default allowed origins if none specified in environment variables
const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

// Properly sets CORS headers
export function corsify(req: NextRequest, res: Response, preflight = false): Response {
  const headers = new Headers(res.headers);
  const origin = getAllowedOriginFromRequest(req) || EFFECTIVE_ALLOWED_ORIGINS[0];
  
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
  
  // Return with headers
  return new Response(res.body, { 
    status: res.status, 
    statusText: res.statusText, 
    headers 
  });
}
```

The implementation correctly avoids using wildcards (*) with credentials and includes the proper allowlist of domains.

## Actual Responses
For real POST requests, the response includes the following CORS headers:

- `Access-Control-Allow-Origin` echoing the request origin (e.g., `https://www.ria-hunter.app`)
- `Access-Control-Allow-Credentials: true`
- `Vary: Origin`

The headers are consistently set through the centralized `corsify` function in `lib/cors.ts`.

## Global Middleware/Headers
In `middleware.ts`, there is no code stripping or overriding CORS headers. In fact, it properly passes OPTIONS requests through to the route handlers:

```typescript
// Always allow CORS preflight to pass through to route handlers
if (request.method === 'OPTIONS') {
  return NextResponse.next()
}
```

The `next.config.mjs` does not contain any headers or rewrites that would affect CORS.

The `vercel.json` file is minimal and does not include any header configurations:
```json
{
  "framework": "nextjs"
}
```

## SSE Payload Check
The Server-Sent Events (SSE) implementation in `app/api/ask-stream/route.ts` correctly sets up:

```typescript
// Create the response with stream
const response = new Response(sse, {
  headers: {
    ...corsHeaders(request),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
});
```

The stream format follows standard SSE conventions:
- Emits `data: token` events for each token
- Ends with `event: end` to signal completion
- Handles errors with `event: error` and error data

The Cache-Control and Connection headers are correctly set for SSE.

## Credits Logic
The anonymous limit is now defined in `app/config/credits.ts`:

```typescript
export const CREDITS_CONFIG = {
  // Anonymous user limits
  ANONYMOUS_FREE_CREDITS: 15,
  
  // Messages
  MESSAGES: {
    CREDITS_EXHAUSTED_ANONYMOUS: 'You have used all 15 free searches. Create an account to continue.',
    // ...
  }
}
```

The target limit is 15 as shown in the configuration.

For 402 responses, the body is:
```json
{
  "error": "You have used all 15 free searches. Create an account to continue.",
  "code": "PAYMENT_REQUIRED",
  "remaining": 0,
  "isSubscriber": false,
  "upgradeRequired": true
}
```

The anonymous cookies are read in `parseAnonCookie` and written in `withAnonCookie` functions.

## Cookie Attributes
The cookie configuration for anonymous users lacks proper cross-site attributes. The current implementation in `app/api/ask-stream/route.ts`:

```typescript
function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.set(
    'Set-Cookie', 
    `${CREDITS_CONFIG.ANONYMOUS_COOKIE_NAME}=${JSON.stringify({ count: newCount })};path=/;max-age=${CREDITS_CONFIG.ANONYMOUS_COOKIE_MAX_AGE}`
  );
  // ...
}
```

This is missing `SameSite=None; Secure; Domain` attributes required for cross-site usage. Similarly, in the `/api/ask` route, the cookies use `SameSite=Lax` which may not work cross-site:

```typescript
headers.append('Set-Cookie', `rh_qc=${newCount}; Path=/; Max-Age=2592000; SameSite=Lax`)
```

## Logs for Failures
[Note: Production logs cannot be accessed directly through this analysis. This would require examining server logs directly.]

## Deployed Domains
The allowed backend domains configured in the CORS settings are:
- `https://www.ria-hunter.app`
- `https://ria-hunter.app`
- `https://ria-hunter-app.vercel.app`
- `http://localhost:3000` (development)
- `http://localhost:3001` (development)
- Vercel preview URLs matching `*.vercel.app` with prefixes `ria-hunter-` or `ria-hunter-app-`

These match the frontend's expected domain allowlist. Both www and non-www variants are properly included.
