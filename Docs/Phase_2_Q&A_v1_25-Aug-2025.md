# Phase 2 Q&A - v1 (25-Aug-2025)

## A. Deployment & routing

### Q1: What is the production API base URL for the backend?
`https://api.ria-hunter.app`

### Q2: Does the frontend call the backend via relative `/api/*` or absolute URL? Current value(s)?
The frontend calls the backend via relative `/api/*` paths. This can be seen in the middleware.ts configuration and API route structure.

### Q3: Where is the backend deployed (Vercel, Cloud Run, other) and region(s)?
The backend is deployed on Vercel. The region isn't explicitly specified, but Vercel typically deploys to multiple regions by default.

### Q4: Are `/api/ask-stream` and `/api/subscription-status` real backend routes in prod? If not, what are the correct paths?
Yes, both `/api/ask-stream` and `/api/subscription-status` are real backend routes in production. They are implemented in:
- `/app/api/ask-stream/route.ts`
- `/app/api/subscription-status/route.ts`

### Q5: Which HTTP method(s) does `/api/ask-stream` accept (GET/POST)?
`/api/ask-stream` accepts POST and OPTIONS methods. This is defined in the CORS headers in the route file.

### Q6: Which HTTP method(s) does `/api/subscription-status` accept?
`/api/subscription-status` accepts GET and OPTIONS methods.

### Q7: Is Cross‑Origin Resource Sharing (CORS) enabled? List allowed origins and whether credentials are allowed.
Yes, CORS is enabled. The allowed origins are:
- `https://www.ria-hunter.app`
- `https://ria-hunter.app`
- `https://ria-hunter-app.vercel.app`
- Any Vercel preview deployments matching `https://ria-hunter-*.vercel.app`

Credentials are not explicitly allowed in the CORS configuration (no 'Access-Control-Allow-Credentials' header).

## B. Auth & identity

### Q8: Which auth does the backend validate (Supabase, Auth0, both)?
The backend validates Supabase authentication. This can be seen in the middleware.ts file where Supabase is used for token validation.

### Q9: What auth token/cookie does each endpoint expect (name, header, scheme)?
Most endpoints expect a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

The token is then validated against Supabase auth.

### Q10: Should anonymous users be able to call `/api/ask-stream`? If yes, how are they identified?
Yes, anonymous users can call `/api/ask-stream`. The middleware.ts file specifically includes this path in the `skipAuthPaths` array:
```javascript
const skipAuthPaths = [
  // ... other paths
  '/api/ask-stream', // Streaming version of ask; allow anonymous
]
```
Anonymous users are not explicitly identified but are likely tracked by IP address or session cookies for rate limiting purposes.

### Q11: What is the expected response of `/api/subscription-status` for anonymous users?
The `/api/subscription-status` endpoint requires authentication and returns a 401 Unauthorized error for anonymous users. The code checks for a userId from the request headers and returns an error if not present.

### Q12: Are cookie domains set for production (e.g., `.ria-hunter.app`)?
There is no explicit cookie domain configuration in the code that was examined. Supabase authentication primarily uses tokens rather than cookies.

### Q13: Do server handlers use the Supabase service‑role key or anon key? Where?
Server handlers use the Supabase service-role key for admin-level database operations. This is configured in the `supabaseAdmin` client, which is imported from `@/lib/supabaseAdmin` in the middleware and several API routes.

### Q14: Are Row Level Security (RLS) policies enabled? Summarize policies touching credits/subscriptions.
Yes, RLS policies are enabled for user data tables. For credits/subscriptions, the policies include:

- Users can only view their own query logs
- Users can only view their own share logs
- Users can only view their own subscription status
- Service role can manage all records for API usage tracking and webhook handling

## C. API contracts & middleware

### Q15: Provide the exact request schema for `/api/ask-stream` (fields, types).
Request schema for `/api/ask-stream`:
```typescript
{
  query: string  // The natural language query to process
}
```

### Q16: Provide the exact response/streaming protocol (ReadableStream vs Server‑Sent Events).
The `/api/ask-stream` endpoint uses Server-Sent Events (SSE) protocol. The code sets the Content-Type header to 'text/event-stream' and sends data in SSE format with 'data:' prefixes.

### Q17: What prechecks run before answering (auth, credits, rate limit)?
From the code examined, the following prechecks occur:
1. CORS validation
2. Request body validation (checking for a valid query parameter)
3. Authentication is optional as anonymous users are allowed
4. There doesn't appear to be explicit credit or rate limit checks in the examined code for `/api/ask-stream`, though the credits system exists elsewhere in the application.

### Q18: Under what conditions does `/api/ask-stream` return 400/401/403/405/429/5xx?
- 400: When the query is missing or invalid (empty)
- 401: Not explicitly returned as anonymous users are allowed
- 403: Not explicitly returned in the examined code
- 405: Implicitly for methods other than POST and OPTIONS
- 429: Not explicitly returned in the examined code
- 5xx (500): When an internal error occurs during processing

### Q19: What middleware (e.g., `middleware.ts`, rewrites) affects `/api/*`?
The `middleware.ts` file affects all `/api/*` routes. It:
1. Allows CORS preflight requests to pass through
2. Skips auth for specified paths including `/api/ask-stream`
3. Validates JWT tokens from the Authorization header for protected routes
4. Adds user information to request headers for authenticated requests

### Q20: Are any Next.js route handlers marked `export const runtime = 'edge'`? Which ones?
From the code examined, there isn't an explicit `export const runtime = 'edge'` declaration in the route handlers, though it's mentioned in the CORS support document as a comment to "keep edge runtime if already used." The specific information would require examining all route files.

### Q21: Is the backend using the App Router or Pages Router for APIs?
The backend is using the App Router for APIs. This is evident from the file structure (`app/api/*/route.ts`) which follows the App Router convention.

### Q22: Are request bodies parsed as `application/json` only or others (e.g., `text/event-stream`)?
Request bodies are primarily parsed as `application/json`. In the `/api/ask-stream` route, the request is parsed with `await request.json()`.

### Q23: Is there an `/api/credits` (or similar) endpoint? Contract?
There isn't a specific `/api/credits` endpoint visible in the codebase. Credit information appears to be included in the responses of other endpoints, such as `/api/subscription-status`.

## D. Credits & billing (incl. change to 15 freebies)

### Q24: Where is the default free‑credit count defined (environment variable, DB seed, constant)? Current value?
The default free credit count appears to be defined in code. In the `/api/subscription-status` route, non-subscribers get:
```javascript
const allowedQueries = 2 + Math.min(shareCount, 1);
```
So the current value is 2 free queries plus 1 bonus query if the user has shared at least once.

### Q25: Business rule: do non‑logged‑in users receive free credits? If yes, how many (target: 15) and how are they tracked?
From the examined code, anonymous (non-logged-in) users can access certain endpoints like `/api/ask-stream`, but there isn't a clear indication of how many free credits they receive or how they're tracked. The API documentation suggests they get 2 queries total.

### Q26: Table schema for credits (columns, constraints, indexes).
There isn't a dedicated "credits" table. Instead, credits are tracked through:

1. `user_queries` table:
   - id (UUID, PRIMARY KEY)
   - user_id (UUID, references auth.users)
   - created_at (TIMESTAMP WITH TIME ZONE, default now())
   - Index on (user_id, created_at)

2. `user_shares` table:
   - id (UUID, PRIMARY KEY)
   - user_id (UUID, references auth.users)
   - shared_at (TIMESTAMP WITH TIME ZONE, default now())
   - Index on (user_id, shared_at)

### Q27: On `/api/ask-stream`, when are credits decremented—request start, first token, or success only?
The examined code for `/api/ask-stream` doesn't show explicit credit decrementing. However, based on how the system is structured, credits would likely be decremented at request start.

### Q28: Should failed/aborted requests consume a credit?
The examined code doesn't provide explicit information on whether failed/aborted requests consume credits.

### Q29: How are concurrent requests made idempotent to avoid double‑decrement?
The examined code doesn't show explicit handling for idempotency to prevent double-decrementing credits during concurrent requests.

### Q30: What subscription/billing system is used (Stripe, Supabase Billing, other)?
Stripe is used for subscription/billing. This is evident from:
1. The Stripe dependency in package.json
2. Usage of Stripe in the `/api/subscription-status` route
3. Environment variables for Stripe in the env.local file

### Q31: Which webhook endpoints exist (purchase, cancel, refund) and how do they modify credits/subscription status?
There appears to be a `/api/stripe-webhook` endpoint (listed in the middleware.ts skipAuthPaths). The specific implementation details weren't examined, but it likely handles subscription events (creation, updates, cancellations) and updates the subscriptions table accordingly.

## E. Database & migrations

### Q32: What is the production database (Supabase Postgres/Cloud SQL/etc.) and region?
The production database is Supabase Postgres. The URL is:
```
https://llusjnpltqxhokycwzry.supabase.co
```
The region isn't explicitly specified.

### Q33: Are all migrations applied in prod? List the last 3 applied migration IDs/timestamps.
The information about which migrations are applied in production isn't available in the examined code. The last 3 migration files by timestamp are:
1. `20250824000000_create_hnsw_index.sql`
2. `20250814094500_fix_compute_vc_signature.sql`
3. `20250814000200_add_contact_submissions_table.sql`

### Q34: Do message/chat tables allow `user_id` to be null (for anonymous usage)?
There don't appear to be explicit message/chat tables in the examined schema. The `user_queries` table requires a non-null `user_id` (NOT NULL constraint), suggesting no support for anonymous usage in that table.

### Q35: Is `pgvector` installed and are embedding indexes present in prod?
Yes, `pgvector` is installed (it's a dependency in package.json) and embedding indexes are present. There are migrations related to vector similarity search and HNSW indexes:
- `20250805000000_add_vector_similarity_search.sql`
- `20250824000000_create_hnsw_index.sql`

### Q36: Any scheduled jobs (cron/Edge Config/Cloud Scheduler) touching credits, cleanups, or indexing?
No explicit scheduled jobs were identified in the examined code that touch credits, perform cleanups, or handle indexing.

### Q37: What feature flags/config records are required in DB for chat/credits to work? Current values?
No explicit feature flags or config records were identified in the examined code that are required for chat/credits functionality.

## F. Retrieval‑Augmented Generation (RAG) & data

### Q38: Where are corpora stored in prod (bucket name, storage type)?
The corpora appear to be stored in the Supabase database, particularly in the `narratives` table which contains embeddings. There isn't clear evidence of external storage in the examined code.

### Q39: Is the embeddings/index build complete in prod? Doc counts and last index time?
The information about embeddings/index build status isn't available in the examined code.

### Q40: What retrieval strategy is used (vector only, hybrid keyword+vector)? Provide key parameters (k, filters).
A hybrid search approach is used. In the `/api/ask-stream` route, `executeEnhancedQuery` is called with filters for state and city if available. The API documentation also mentions a `useHybridSearch` parameter. The limit parameter appears to be set to 10 for the query.

### Q41: Are there tenant/region filters applied by default?
There don't appear to be default tenant/region filters. Filters for location (city/state) are extracted from the query in the `/api/ask-stream` route but aren't applied by default.

### Q42: What is the maximum context size and truncation policy?
In the generator.ts file, the max_tokens parameter for the OpenAI call is set to 800. There isn't an explicit truncation policy visible in the examined code.

## G. External services & keys

### Q43: Which model/provider is used in prod (e.g., Google Vertex AI Gemini, OpenAI)? Model name and region.
Both Google Vertex AI and OpenAI are supported, with the provider configurable via the `AI_PROVIDER` environment variable. The current setting in env.local is "google". For OpenAI, the model used is "gpt-4o" as seen in the generator.ts file.

### Q44: List required prod env vars (names only) and whether each is set.
Required environment variables:
- SUPABASE_URL (set)
- SUPABASE_SERVICE_ROLE_KEY (set)
- NEXT_PUBLIC_SUPABASE_URL (set)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (set)
- AI_PROVIDER (set to "google")
- OPENAI_API_KEY (set)
- GOOGLE_CLOUD_PROJECT (set to "ria-hunter-backend")
- GOOGLE_PROJECT_ID (set to "ria-hunter-backend")
- GOOGLE_APPLICATION_CREDENTIALS (set to "./gcp-key.json")
- STRIPE_SECRET_KEY (set, but placeholder in env.local)
- STRIPE_WEBHOOK_SECRET (set, but placeholder in env.local)
- STRIPE_PRICE_ID (set, but placeholder in env.local)

### Q45: For streaming, what protocol is implemented end‑to‑end (SSE, fetch streaming, gRPC)?
Server-Sent Events (SSE) is implemented for streaming. The `/api/ask-stream` endpoint sets the Content-Type header to 'text/event-stream' and formats data with 'data:' prefixes.

### Q46: Are Document AI/SEC ingestion pipelines active in prod? Any recent quota or auth errors?
There are Document AI environment variables set (DOCUMENT_AI_PROCESSOR_ID, DOCUMENT_AI_PROCESSOR_LOCATION), suggesting Document AI is used. SEC API credentials are also present. However, information about pipeline activity or recent errors isn't available in the examined code.

## H. Observability, CI/CD, versions

### Q47: Where should we look for runtime logs for these endpoints (Vercel, GCP, Supabase)?
Runtime logs for these endpoints would primarily be in Vercel since that's where the backend is deployed.

### Q48: Runtime versions in prod: Node.js, Next.js, and any `edge` runtimes.
- Node.js: Requires >= 18 (from package.json "engines")
- Next.js: 13.4.8 (from package.json)
- Edge runtimes: Not explicitly specified in the examined code

### Q49: Last successful backend deployment SHA/time; any failed deploys since the refactor?
This information isn't available in the examined code.

### Q50: Are there feature flags/toggles that can disable chat or credits in prod? List names and current values.
No explicit feature flags/toggles were identified in the examined code that can disable chat or credits functionality.
