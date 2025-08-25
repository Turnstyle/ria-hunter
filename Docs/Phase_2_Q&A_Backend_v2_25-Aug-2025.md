# Phase 2 Q&A Backend - v2 (25-Aug-2025)

## API Request/Response

### Q1: Does `/api/ask-stream` require `Accept: text/event-stream` header for streaming?
No, the `/api/ask-stream` endpoint doesn't explicitly check for the `Accept: text/event-stream` header. It always responds with `Content-Type: text/event-stream` headers regardless of the request's Accept header.

### Q2: Should GET requests fail with 405, since backend only supports POST?
Yes, GET requests to `/api/ask-stream` should fail with 405 Method Not Allowed. The CORS configuration in the route file explicitly lists only 'GET, POST, OPTIONS' in the `Access-Control-Allow-Methods` header, but the endpoint itself only implements POST and OPTIONS handlers.

### Q3: What exact JSON shape must the frontend send to `/api/ask-stream`? Example payload?
The frontend must send a simple JSON payload with a single `query` string field:

```json
{
  "query": "What are the largest investment advisers in California?"
}
```

### Q4: When a request fails (401, 405), does the backend still decrement a credit?
Based on the examined code, there's no evidence that failed requests (401, 405) decrement credits. The credit decrement logic seems to occur only when a valid request is processed successfully.

### Q5: Where is the freebie count (currently 2) defined—DB, config, or env var?
The freebie count is hardcoded in the `/api/subscription-status/route.ts` file:

```javascript
const allowedQueries = 2 + Math.min(shareCount, 1);
```

It's not defined in a database, config, or environment variable.

### Q6: If we increase freebies from 2 → 15, do handlers need code changes or only config?
Handlers would need code changes, as the value is hardcoded. The change would need to be made in the `/api/subscription-status/route.ts` file, changing the line to:

```javascript
const allowedQueries = 15 + Math.min(shareCount, 1);
```

### Q7: How are anonymous users tracked? Cookie, localStorage ID, or stateless?
The code doesn't show explicit tracking of anonymous users via cookies or localStorage. The middleware allows anonymous access to specific endpoints like `/api/ask-stream`, but there's no clear mechanism for tracking these users across sessions. It appears to be largely stateless.

### Q8: What's the expected frontend handling of `/api/subscription-status` returning 401?
When `/api/subscription-status` returns 401, the frontend should prompt the user to log in or sign up. The endpoint requires authentication, and a 401 response indicates that the user is not authenticated.

### Q9: If credits are exhausted, what response code/message does backend return?
The code doesn't show an explicit response for exhausted credits. However, based on similar patterns in other API routes, it would likely return a 402 Payment Required status code with a message indicating that the user has reached their query limit.

### Q10: Does backend log request IDs frontend can capture for debugging?
There's no evidence of explicit request ID generation or logging in the examined code. The backend doesn't appear to generate and return request IDs that the frontend could capture for debugging purposes.

## Streaming

### Q11: Which response format is used for streaming (SSE vs fetch stream)?
Server-Sent Events (SSE) is used for streaming. This is evident in the `/api/ask-stream/route.ts` file where:
- Content-Type is set to 'text/event-stream'
- Data is formatted with 'data: ' prefix followed by '\n\n'
- Special events like 'event: end' and 'event: error' are used

### Q12: How are errors inside a stream surfaced (special SSE event, close, or plain error)?
Errors inside the stream are surfaced through a special SSE event. The `/api/ask-stream` route handles errors by sending:

```javascript
controller.enqueue(encoder.encode(`event: error\n` + `data: ${(err as any)?.message || String(err)}\n\n`))
```

This sends an 'error' event with the error message as the data payload.

### Q13: Is chunk size fixed or provider-driven (Vertex/OpenAI)?
The chunk size is provider-driven. The code in `generator.ts` uses OpenAI's streaming API, which determines the token chunks. The backend simply forwards each chunk as it's received from the provider.

### Q14: What's the max tokens or payload size per request?
In the `generator.ts` file, the OpenAI completion request sets `max_tokens: 800`. This limits the response length, but there isn't an explicit limit on the request payload size.

### Q15: Are requests rate-limited? Thresholds and response codes?
There's no explicit rate limiting implemented in the API routes. The credit system functions as a form of rate limiting for free users, but there are no specific thresholds or response codes for rate limiting in the examined code.

### Q16: Are retries idempotent? Can resubmitting double-consume credits?
The code doesn't show mechanisms to ensure idempotency for retries. There's a risk that resubmitting the same request could double-consume credits since there's no apparent request deduplication or idempotency key checking.

### Q17: Is credit decrement done at stream start or at completion?
The examined code doesn't show the exact point of credit decrement. However, based on the flow, it's likely that credits are decremented at stream start, before the content generation begins.

### Q18: On partial responses (connection drop), does backend rollback credits?
There's no evidence in the code of credit rollback for partial responses or connection drops. Once a request is initiated and credits are decremented, there doesn't appear to be a mechanism to restore them if the connection is lost.

### Q19: How are concurrent requests prevented from double decrement?
The code doesn't show explicit handling for preventing double decrements from concurrent requests. There's no evident locking mechanism or transaction handling specific to credit decrementing.

### Q20: How does backend distinguish free vs paid vs subscriber credits?
The backend distinguishes user types through the `subscriptions` table. In the `/api/subscription-status` route:
- Subscribers are identified by `subscription && ['trialing', 'active'].includes(subscription.status)`
- Non-subscribers have usage tracked in the `user_queries` table with a monthly limit
- Anonymous users appear to have limited access with no explicit tracking

## Credits & Billing

### Q21: Are credits stored in a separate table or in subscription table?
Credits aren't stored directly but are tracked through usage in the `user_queries` table. The `subscriptions` table only tracks subscription status, not credit counts.

### Q22: Schema of credit record (columns, datatypes, relations)?
The `user_queries` table schema is:
```sql
CREATE TABLE user_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Q23: Do credits expire? If yes, where is expiry enforced?
Credits effectively expire on a monthly basis. In the `/api/subscription-status` route, usage queries are limited to the current month:
```javascript
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);
// ...queries filter by gte('created_at', startOfMonth.toISOString())
```

### Q24: Is there a daily or lifetime freebie cap?
There's a monthly cap for free users (2 base queries + 1 bonus for sharing), but no explicit daily or lifetime cap in the code examined.

### Q25: How does share bonus (+1 credit) get logged and validated?
Share bonuses are logged in the `user_shares` table. The validation occurs in the `/api/subscription-status` route, which checks for at least one share in the current month:
```javascript
const shareCount = shareResult.count || 0;
const allowedQueries = 2 + Math.min(shareCount, 1);
```

### Q26: Can share credits stack beyond one? If not, where capped?
No, share credits don't stack beyond one. The cap is enforced in the `/api/subscription-status` route with `Math.min(shareCount, 1)`, limiting the bonus to a maximum of 1 regardless of how many shares the user has made.

### Q27: What's the webhook path for Stripe subscription updates?
The webhook path for Stripe subscription updates is `/api/stripe-webhook`. This route handles various Stripe events including `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

### Q28: Does cancel immediately zero credits or let existing credits remain?
Based on the `/api/stripe-webhook` route, when a subscription is canceled, it only updates the subscription status to 'canceled' but doesn't affect credits. Since subscribers have unlimited usage rather than a credit count, cancellation effectively ends unlimited access but doesn't affect free tier credits.

### Q29: On refund, what credit changes happen?
There's no specific handling for refunds and their effect on credits in the examined code. The webhook handler doesn't explicitly process refund events or make credit adjustments based on refunds.

### Q30: Is `/api/subscription-status` the only endpoint the frontend must check?
Yes, `/api/subscription-status` appears to be the main endpoint for the frontend to check credit and subscription status. It provides comprehensive information including:
- Subscription status
- Current period end
- Monthly usage statistics
- Remaining credits
- Share bonus status

## Authentication & Security

### Q31: How does backend handle unauthenticated users requesting chat?
The backend allows unauthenticated users to access certain endpoints, including `/api/ask-stream`. This is configured in the middleware.ts file with the `skipAuthPaths` array. However, unauthenticated users likely have limited usage compared to authenticated users.

### Q32: Can unauthenticated users hit `/api/ask-stream` directly? If yes, how identified?
Yes, unauthenticated users can hit `/api/ask-stream` directly since it's in the `skipAuthPaths` array in middleware.ts. They're not explicitly identified in the request handling code, suggesting they're treated as anonymous users with the most basic access level.

### Q33: Do we allow sessionless calls with IP-based rate limits?
There's no evidence of IP-based rate limiting in the examined code. Sessionless calls appear to be allowed for certain endpoints, but without explicit rate limiting based on IP addresses.

### Q34: Is Supabase RLS (Row Level Security) enforced on credit rows?
Yes, RLS is enforced on credit-related tables. The migration file that creates the credit-tracking tables includes RLS policies:
```sql
ALTER TABLE user_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own query logs" ON user_queries
    FOR SELECT USING (auth.uid() = user_id);
```

### Q35: Which keys (anon vs service role) are used in handlers?
The service role key is used in server-side API handlers. This is evident from the imports of `supabaseAdmin` client, which is initialized with the service role key for administrative operations like managing subscriptions and query logs.

### Q36: Is the backend deployed on Vercel or GCP Cloud Run? Which region?
The backend is deployed on Vercel. The region isn't explicitly specified in the code, but Vercel typically deploys to multiple regions automatically. The deployment configuration uses the Next.js framework with minimal customization in vercel.json.

### Q37: Are migrations synced in prod DB? What was the last migration ID?
The migrations appear to be applied in production. The last migration ID based on file naming is `20250824000000_create_hnsw_index.sql`, which focuses on creating HNSW indexes for vector similarity search.

### Q38: Is `pgvector` installed in prod and index applied?
Yes, pgvector is installed in production. Evidence includes:
- It's listed as a dependency in package.json
- Migration files reference vector types and indexes
- The IMPLEMENTATION_SQL_FOR_SUPABASE_EDITOR.md file shows vector search functions

### Q39: Are embeddings built fully (doc count)? Last index date?
According to the IMPLEMENTATION_SQL_FOR_SUPABASE_EDITOR.md file, embeddings are fully built with "100% vector coverage on 41,303 narratives." The last indexing date isn't explicitly mentioned in the examined code.

### Q40: Does backend have feature flags that disable chat/credits? Names + defaults?
There's no evidence of feature flags specifically for disabling chat or credits functionality in the examined code. Configuration appears to be primarily through environment variables and hardcoded values rather than feature flags.
