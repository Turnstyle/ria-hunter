# Phase 2 Q&A Backend - v3 (25-Aug-2025)

## Credits & Session Management

### Q1: When freebies are raised to 15, will the backend automatically apply this for existing anonymous users, or only new sessions?
For anonymous users, the system would automatically apply the new freebie count to both existing and new sessions. Since the anonymous user tracking is done via cookies (`anon_queries` cookie in the `/api/v1/ria/search` route), and the freebie limit is checked against this count at request time, raising the hardcoded limit would immediately apply to all anonymous users regardless of when their session started.

### Q2: Does `/api/ask-stream` support OPTIONS preflight for POST + SSE requests (needed for CORS)?
Yes, `/api/ask-stream` explicitly supports OPTIONS preflight for POST + SSE requests. The route has an `OPTIONS` handler function that returns a 204 No Content response with the appropriate CORS headers:

```javascript
export function OPTIONS(req: NextRequest) {
  return new Response(null, { 
    status: 204, 
    headers: { 
      ...corsHeaders(req), 
      'Access-Control-Max-Age': '86400' 
    } 
  });
}
```

The headers explicitly include `'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'`.

### Q3: Are credits decremented only after the model provider starts sending tokens, or at request acceptance?
Based on the code in the `/api/v1/ria/search` route, credits are decremented at request acceptance, before the model provider starts processing. This is evident from the fact that the credit decrement (query logging) happens before the embedding generation and search execution:

```javascript
// Log this query
await supabaseAdmin.from('user_queries').insert([{ user_id: userId }]);

// Then perform the actual search...
```

The same pattern is likely used for `/api/ask-stream`, decrementing credits before starting the stream.

### Q4: If a user exhausts credits, does the backend return a dedicated error payload (JSON with code), or just a plain 403?
The backend returns a dedicated error payload with a descriptive message and error code, not just a plain 403. In the `/api/v1/ria/search` route, when a user exhausts credits, it returns:

```javascript
{
  error: 'Free query limit reached. Upgrade to continue.',
  code: 'PAYMENT_REQUIRED',
  remaining: 0,
  isSubscriber: false,
  upgradeRequired: true
}
```

This is returned with a 402 Payment Required status code, not 403 Forbidden.

### Q5: Are there any backend-side feature flags or env vars that could silently disable SSE streaming in prod?
There don't appear to be specific feature flags or environment variables that would silently disable SSE streaming. However, the `AI_PROVIDER` environment variable could indirectly affect streaming if set to a provider that doesn't support streaming. The system is designed to use either OpenAI or Google Vertex AI based on this variable, and if there were configuration issues with the selected provider, it could impact streaming functionality.

## API Contract Details

### Q6: What exact JSON body must the frontend send to `/api/ask-stream`? Please give a working example.
The frontend must send a simple JSON body with a `query` field containing the natural language question:

```json
{
  "query": "Which investment advisers in San Francisco have the largest private funds?"
}
```

This is the only required field for the `/api/ask-stream` endpoint. The route extracts this with:

```javascript
const body = await request.json().catch(() => ({} as any))
const query = typeof body?.query === 'string' ? body.query : ''
```

### Q7: Should the frontend always send `Accept: text/event-stream`? What happens if it doesn't?
The frontend should ideally send `Accept: text/event-stream`, but it's not strictly required. The `/api/ask-stream` endpoint doesn't check the Accept header and always responds with `Content-Type: text/event-stream` regardless of what the client requested. If the client doesn't send this header, the endpoint will still function correctly, but it's good practice for the frontend to send the appropriate Accept header.

### Q8: On 405 responses, does the backend log the received HTTP method?
The backend doesn't explicitly log the received HTTP method for 405 responses. The route only defines handlers for POST and OPTIONS methods, and Next.js will automatically return a 405 Method Not Allowed for other methods, but there's no custom logging implementation for this scenario in the examined code.

### Q9: Are there any known mismatches in prod between staging/prod routes (e.g., `/api/ask-stream` vs `/api/ask`)?
There's no direct evidence of mismatches between staging and production routes in the code. Both `/api/ask-stream` and `/api/ask` appear to be valid routes with different functionality:
- `/api/ask-stream` uses SSE for streaming responses
- `/api/ask` appears to be a non-streaming version of the same functionality

They're designed to coexist rather than being staging/production variants of the same endpoint.

### Q10: What retry/backoff behavior is recommended when backend returns 429 (rate limit)?
There's no explicit documentation for retry/backoff behavior in the examined code. However, based on standard practices and the Stripe error handling in `/api/create-checkout-session/route.ts`, a reasonable approach would be:
1. Implement exponential backoff starting at 1 second
2. Increase delay by a factor of 2 for each retry (1s, 2s, 4s, 8s...)
3. Add a small random jitter to avoid thundering herd problems
4. Cap retries at 5 attempts or a maximum delay of 32 seconds
5. Only retry for 429 responses, not other error codes

## Freebie & Credit Implementation

### Q11: Is the freebie logic purely backend-driven, or does frontend also enforce a minimum check?
The freebie logic appears to be primarily backend-driven. The backend enforces credit limits and returns remaining credit information in API responses. There's no indication that the frontend has its own independent credit tracking or enforcement; it likely displays the credit information provided by the backend and potentially disables certain features when credits are exhausted based on the backend's responses.

### Q12: Where in code/config is the freebie constant currently set (DB seed, env var, handler)?
The freebie constant is hardcoded directly in the handler code. For the `/api/subscription-status` route, it's defined as:
```javascript
const allowedQueries = 2 + Math.min(shareCount, 1);
```

For the `/api/v1/ria/search` route, anonymous users have a different hardcoded limit:
```javascript
// If anonCount >= 2, return payment required error
```

These values are not stored in a database, configuration file, or environment variable.

### Q13: Does backend distinguish "free" credits from "paid" credits in schema, or just one counter?
The backend doesn't distinguish between "free" and "paid" credits in the schema. Instead, it uses a binary approach:
- For subscribers (paid users), it doesn't track or limit queries; they have unlimited access
- For non-subscribers (free users), it tracks all queries in the `user_queries` table and enforces limits based on the count

There's no separation of "free credits" vs "paid credits" in the data model; users either have unlimited access or are subject to the free tier limits.

### Q14: If a credit decrement fails mid-transaction, how is it rolled back?
There's no explicit transaction management or rollback handling specifically for credit decrement failures in the examined code. In the `/api/v1/ria/search` route, the credit decrement (insertion into `user_queries`) occurs as a single operation:

```javascript
await supabaseAdmin.from('user_queries').insert([{ user_id: userId }]);
```

If this operation fails, the entire request would likely fail with an error, preventing the actual search from executing. There's no complex transaction that would require explicit rollback.

### Q15: Are subscription credits refreshed immediately after Stripe webhook, or cached?
Subscription status appears to be updated immediately after Stripe webhook events. In the `/api/stripe-webhook` route, when subscription events like `customer.subscription.updated` occur, the database is immediately updated:

```javascript
await supabaseAdmin.from('subscriptions').update({
  status: updatedSub.status,
  current_period_end: new Date(updatedSub.current_period_end * 1000).toISOString(),
  updated_at: new Date().toISOString(),
}).eq('user_id', userId);
```

There's no evidence of caching subscription status; each API call that needs subscription information queries the database directly.

## Anonymous Users & Sessions

### Q16: For anonymous users, does backend tie credits to IP, cookie, or is it entirely frontend-managed?
For anonymous users, the backend ties credits to cookies, not IP addresses. The `/api/v1/ria/search` route demonstrates this with functions to parse and update the `anon_queries` cookie:

```javascript
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

function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', `anon_queries=${JSON.stringify({ count: newCount })};path=/;max-age=2592000`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
```

### Q17: When `/api/subscription-status` returns 401, is that the intended way to signal "anonymous"?
Yes, a 401 Unauthorized response from `/api/subscription-status` is the intended way to signal that the user is anonymous (not logged in). This is clear from the route implementation:

```javascript
const userId = req.headers.get('x-user-id');

if (!userId) {
  return NextResponse.json(
    { error: 'User authentication required' },
    { status: 401 }
  );
}
```

This indicates that authentication is required to access subscription status, and anonymous users should be prompted to log in.

### Q18: Are there any backend logs/metrics that confirm when SSE streaming starts and ends?
There are limited backend logs for SSE streaming events. In the `/api/ask-stream` route, there's error logging:

```javascript
console.error('Error in /api/ask-stream:', error)
```

But there's no explicit logging for stream start or completion events. The code doesn't implement comprehensive metrics or logging for tracking the streaming lifecycle.

### Q19: What error code or event does backend send if streaming fails mid-way due to provider error?
If streaming fails mid-way due to a provider error, the backend sends an SSE event with type "error" and the error message as data:

```javascript
controller.enqueue(encoder.encode(`event: error\n` + `data: ${(err as any)?.message || String(err)}\n\n`))
```

This allows the frontend to distinguish between normal data chunks and error conditions within the same stream connection.

### Q20: What deployment environment currently powers prod API (Vercel Edge, Vercel Node, Cloud Run)? Any runtime limits to be aware of?
The production API is powered by Vercel's Node.js runtime, not Vercel Edge or Cloud Run. This is evident from:

1. The project configuration in `next.config.mjs` doesn't specify edge runtime
2. The webpack configuration indicates Node.js serverless function optimization
3. Deployment documentation mentions using Vercel CLI for deployment

Runtime limits to be aware of with Vercel Node.js serverless functions include:
- **Execution timeout**: 60 seconds max (potential issue for long-running streams)
- **Response size limit**: 4.5MB for serverless functions
- **Memory limit**: 1024MB by default
- **Concurrent executions**: Limited by your Vercel plan
- **Cold starts**: Functions may experience cold starts if not frequently invoked
