# Backend (ria-hunter) Complete Fix Plan

**CRITICAL: Complete ALL tasks in exact order. Do not proceed to next task until current task verification passes.**

## Task 1: Fix Database Schema Mismatch (BLOCKING EVERYTHING)

### 1A: Check Current Schema
```bash
# Use Supabase CLI to check current schema
supabase db dump --schema-only > current_schema.sql
grep -n "control_persons" current_schema.sql
```

**Expected Result:** You should see what columns actually exist in control_persons table.

### 1B: Fix RPC Function Schema
Create this exact migration file: `supabase/migrations/20250814000000_fix_compute_vc_activity_column_reference.sql`

```sql
-- Fix the compute_vc_activity function to use correct column name
create or replace function public.compute_vc_activity(
  result_limit integer default 10,
  state_filter text default null
)
returns table (
  crd_number bigint,
  legal_name text,
  city text,
  state text,
  vc_fund_count bigint,
  vc_total_aum numeric,
  activity_score numeric,
  executives jsonb
)
language plpgsql
as $$
begin
  return query
  select
    rp.crd_number,
    rp.legal_name,
    rp.city,
    rp.state,
    coalesce(rp.private_fund_count, 0)::bigint as vc_fund_count,
    coalesce(rp.private_fund_aum, 0)::numeric as vc_total_aum,
    (coalesce(rp.private_fund_count, 0) * 0.6 + coalesce(rp.private_fund_aum, 0) / 1000000 * 0.4)::numeric as activity_score,
    (
      select jsonb_agg(json_build_object('name', cp.person_name, 'title', cp.title))
      from public.control_persons cp
      where cp.crd_number = rp.crd_number  -- FIXED: was cp.adviser_id
    ) as executives
  from public.ria_profiles rp
  where (state_filter is null or rp.state = state_filter)
  and coalesce(rp.private_fund_count, 0) > 0
  order by activity_score desc
  limit result_limit;
end;
$$;
```

### 1C: Deploy and Test RPC Fix
```bash
# Deploy the migration
supabase db push

# Test the RPC function works
supabase db exec "SELECT * FROM compute_vc_activity(5, 'MO');"
```

**Expected Result:** Should return 5 Missouri RIAs with executives data, no errors.

**CHECKPOINT 1:** RPC function must work before proceeding. If it fails, debug the schema first.

---

## Task 2: Replace /api/ask with Credits-Aware Version

### 2A: Replace /api/ask/route.ts Content
Replace the ENTIRE contents of `app/api/ask/route.ts` with this credits-aware version:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAIService, getAIProvider } from '@/lib/ai-providers'

// Import the working logic from v1
import { callLLMToDecomposeQuery } from './planner'
import { executeEnhancedQuery } from './retriever'
import { buildAnswerContext } from './context-builder'
import { generateNaturalLanguageAnswer } from './generator'

const DEFAULT_ALLOWED_ORIGINS = [
	'https://www.ria-hunter.app',
	'https://ria-hunter.app',
]
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean)
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS

function isAllowedPreviewOrigin(origin: string): boolean {
	try {
		const url = new URL(origin)
		const host = url.hostname
		return host.endsWith('.vercel.app') && (host.startsWith('ria-hunter-') || host.startsWith('ria-hunter-app-'))
	} catch {
		return false
	}
}

function getAllowedOriginFromRequest(req: NextRequest): string | undefined {
	const origin = req.headers.get('origin') || undefined
	if (origin && (EFFECTIVE_ALLOWED_ORIGINS.includes(origin) || isAllowedPreviewOrigin(origin))) return origin
	return undefined
}

function corsify(req: NextRequest, res: Response, preflight = false): Response {
	const headers = new Headers(res.headers)
	const origin = getAllowedOriginFromRequest(req) || EFFECTIVE_ALLOWED_ORIGINS[0]
	headers.set('Access-Control-Allow-Origin', origin)
	headers.set('Vary', 'Origin')
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
	headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	if (preflight) headers.set('Access-Control-Max-Age', '86400')
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export function OPTIONS(req: NextRequest) {
	return corsify(req, new Response(null, { status: 204 }), true)
}

// Extract user ID from JWT token
function decodeJwtSub(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null
	const parts = authorizationHeader.split(' ')
	if (parts.length !== 2 || parts[0] !== 'Bearer') return null
	const token = parts[1]
	const segments = token.split('.')
	if (segments.length < 2) return null
	try {
		const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
		return payload?.sub || null
	} catch {
		return null
	}
}

// Check query limits (copied from v1)
async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }> {
	const startOfMonth = new Date()
	startOfMonth.setDate(1)
	startOfMonth.setHours(0, 0, 0, 0)

	try {
		const { data: subscription } = await supabaseAdmin
			.from('subscriptions')
			.select('status')
			.eq('user_id', userId)
			.single()

		const isSubscriber = !!(subscription && ['trialing', 'active'].includes(subscription.status))
		if (isSubscriber) return { allowed: true, remaining: -1, isSubscriber: true }

		const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
			supabaseAdmin
				.from('user_queries')
				.select('*', { head: true, count: 'exact' })
				.eq('user_id', userId)
				.gte('created_at', startOfMonth.toISOString()),
			supabaseAdmin
				.from('user_shares')
				.select('*', { head: true, count: 'exact' })
				.eq('user_id', userId)
				.gte('shared_at', startOfMonth.toISOString()),
		])

		const allowedQueries = 2 + Math.min(shareCount || 0, 1)
		const currentQueries = queryCount || 0
		const remaining = Math.max(0, allowedQueries - currentQueries)
		return { allowed: currentQueries < allowedQueries, remaining, isSubscriber: false }
	} catch (error) {
		console.error('Error checking query limit:', error)
		return { allowed: true, remaining: 0, isSubscriber: false }
	}
}

// Log query usage (copied from v1)
async function logQueryUsage(userId: string): Promise<void> {
	try {
		await supabaseAdmin.from('user_queries').insert({ user_id: userId })
	} catch (error) {
		console.error('Error logging query usage:', error)
	}
}

// Handle anonymous users with cookie
function parseAnonCookie(req: NextRequest): { count: number } {
	const cookie = req.cookies.get('rh_qc')?.value
	const count = cookie ? Number(cookie) || 0 : 0
	return { count }
}

function withAnonCookie(res: Response, newCount: number): Response {
	const headers = new Headers(res.headers)
	headers.append('Set-Cookie', `rh_qc=${newCount}; Path=/; Max-Age=2592000; SameSite=Lax`)
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const userId = decodeJwtSub(authHeader)
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		
		if (!query) {
			return corsify(request, NextResponse.json({ error: 'Query is required' }, { status: 400 }))
		}

		// CREDITS AND SUBSCRIPTION ENFORCEMENT (THE MISSING PIECE!)
		let needsCookieUpdate = false
		let anonCount = 0

		if (userId) {
			// Authenticated user - check subscription and limits
			const limit = await checkQueryLimit(userId)
			if (!limit.allowed) {
				return corsify(
					request,
					NextResponse.json({
						error: limit.isSubscriber
							? 'Subscription expired. Please renew your subscription to continue.'
							: 'Free query limit reached. Upgrade to continue.',
						code: 'PAYMENT_REQUIRED',
						remaining: limit.remaining,
						isSubscriber: limit.isSubscriber,
						upgradeRequired: true,
					}, { status: 402 })
				)
			}
		} else {
			// Anonymous user - check cookie limit
			const anon = parseAnonCookie(request)
			anonCount = anon.count
			if (anonCount >= 2) {
				return corsify(
					request,
					NextResponse.json({
						error: 'Free query limit reached. Create an account for more searches.',
						code: 'PAYMENT_REQUIRED',
						remaining: 0,
						isSubscriber: false,
						upgradeRequired: true,
					}, { status: 402 })
				)
			}
			needsCookieUpdate = true
		}

		// Process the query using existing logic
		const decomposedPlan = await callLLMToDecomposeQuery(query)
		
		// Parse location like "City, ST" into discrete parts
		let city: string | undefined
		let state: string | undefined
		const loc = decomposedPlan.structured_filters?.location || ''
		if (typeof loc === 'string' && loc.length > 0) {
			const parts = loc.split(',').map((p) => p.trim())
			if (parts.length === 2) {
				city = parts[0]
				state = parts[1].toUpperCase()
			} else if (parts.length === 1 && parts[0].length === 2) {
				state = parts[0].toUpperCase()
			} else {
				city = parts[0]
			}
		}
		
		const structuredData = await executeEnhancedQuery({ filters: { state, city }, limit: 10 })
		const context = buildAnswerContext(structuredData as any, query)
		const answer = await generateNaturalLanguageAnswer(query, context)

		// Log usage and decrement credits
		if (userId) {
			await logQueryUsage(userId)
		}

		// Prepare response
		let response = corsify(
			request,
			NextResponse.json({
				answer,
				sources: structuredData,
				insufficient_data: !structuredData || (Array.isArray(structuredData) && structuredData.length === 0),
				metadata: { 
					plan: decomposedPlan, 
					debug: { provider: process.env.AI_PROVIDER || 'openai', openaiKeyPresent: !!process.env.OPENAI_API_KEY },
					remaining: userId ? -1 : Math.max(0, 2 - (anonCount + 1)) // Return remaining credits
				},
			})
		)

		// Update anonymous cookie if needed
		if (!userId && needsCookieUpdate) {
			response = withAnonCookie(response, anonCount + 1)
		}

		return response
	} catch (error) {
		console.error('Error in /api/ask:', error)
		return corsify(request, NextResponse.json({ 
			error: 'An internal error occurred.', 
			debug: { message: (error as any)?.message || String(error) } 
		}, { status: 500 }))
	}
}
```

### 2B: Update Generator to Be Less Restrictive
Replace line 4-6 in `app/api/ask/generator.ts`:

**OLD:**
```typescript
'If the answer is not present, say you do not have enough data rather than guessing.',
```

**NEW:**
```typescript
'If specific details are missing, provide what information you can from the available data and mention what details are not available. Provide the best possible answer with the data provided.',
```

### 2C: Test the Fixed /api/ask Endpoint
```bash
# Test with curl (replace with your actual auth token)
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -d '{"query": "top 5 RIAs in Missouri with VC activity"}'

# Test anonymous (should work twice, then fail)
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "RIAs in Missouri"}' \
  -c cookies.txt

curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "RIAs in Missouri"}' \
  -b cookies.txt
```

**Expected Results:**
1. Authenticated request should work and return structured RIA data with executives
2. Second anonymous request should include cookie with count=1
3. Third anonymous request should return 402 error with upgrade message

**CHECKPOINT 2:** /api/ask must now enforce credits and return proper Missouri results before proceeding.

---

## Task 3: Add Missing Database Tables

### 3A: Create Missing Tables Migration
Create file: `supabase/migrations/20250814000100_add_missing_tables.sql`

```sql
-- Add missing control_persons table if not exists
CREATE TABLE IF NOT EXISTS public.control_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crd_number BIGINT NOT NULL REFERENCES public.ria_profiles(crd_number) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_control_persons_crd_number ON public.control_persons(crd_number);

-- Add some sample control person data for Missouri RIAs
INSERT INTO public.control_persons (crd_number, person_name, title) VALUES
  (423, 'Ronald James Kruszewski', 'Chairman and CEO'),
  (423, 'James M. Zemlyak', 'President'),
  (423, 'Victor E. Nesi', 'Chief Financial Officer')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.control_persons ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Allow public read access" ON public.control_persons
  FOR SELECT USING (true);
```

### 3B: Deploy and Verify
```bash
# Deploy the migration
supabase db push

# Test that control_persons table exists and has data
supabase db exec "SELECT * FROM control_persons WHERE crd_number = 423;"

# Test the fixed RPC function now includes executives
supabase db exec "SELECT * FROM compute_vc_activity(3, 'MO');"
```

**Expected Result:** Should see control persons data and RPC should now return executives.

---

## Task 4: Self-Verification Protocol

### 4A: Test Full End-to-End Flow
```bash
# Test 1: Verify RPC function works
echo "Testing RPC function..."
supabase db exec "SELECT legal_name, vc_fund_count, executives FROM compute_vc_activity(5, 'MO');" || echo "RPC FAILED"

# Test 2: Test /api/ask with Missouri query
echo "Testing /api/ask endpoint..."
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "top 3 RIAs in Missouri"}' | jq '.answer' || echo "API FAILED"

# Test 3: Test credit limiting
echo "Testing credit limits..."
for i in {1..3}; do
  echo "Request $i:"
  curl -s -X POST http://localhost:3000/api/ask \
    -H "Content-Type: application/json" \
    -d '{"query": "RIAs in Missouri"}' \
    -b cookies.txt -c cookies.txt | jq '.error // .answer'
done
```

### 4B: Missouri Query Verification
```bash
# This specific test addresses the user's main complaint
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "what are the 10 most active RIAs in Missouri with VC activity and who are their executives?"}' | jq '.'
```

**Expected Result:** Should return Missouri-only RIAs with executive names, no "I do not have enough data" message.

---

## Task 5: Final Backend Verification Checklist

Run these commands to verify everything works:

```bash
echo "=== BACKEND VERIFICATION CHECKLIST ==="

echo "✓ 1. RPC Function Test:"
supabase db exec "SELECT COUNT(*) as missouri_rias FROM compute_vc_activity(10, 'MO');" 

echo "✓ 2. Control Persons Test:"
supabase db exec "SELECT COUNT(*) as executives FROM control_persons WHERE crd_number = 423;"

echo "✓ 3. API Credits Test:"
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | jq '.metadata.remaining // "MISSING"'

echo "✓ 4. Geographic Accuracy Test:"
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "RIAs in Missouri"}' | jq '.sources[] | .state' | sort | uniq

echo "✓ 5. No Data Message Test:"
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "top RIAs in Missouri"}' | jq '.answer' | grep -i "not have enough data" && echo "FAIL: Still saying no data" || echo "PASS: Provides data"

echo "=== END VERIFICATION ==="
```

**STOP:** Do not report completion until all 5 verification tests pass. If any fail, debug and fix before proceeding.

---

## Success Criteria for Backend Completion

Before moving to frontend tasks, these must ALL be true:

1. ✅ `compute_vc_activity(10, 'MO')` returns exactly 10 Missouri RIAs with executives data
2. ✅ `/api/ask` enforces credit limits (anonymous users limited to 2 queries)
3. ✅ `/api/ask` returns `metadata.remaining` field with credit count
4. ✅ Geographic queries for Missouri return ONLY Missouri firms
5. ✅ No more "I do not have enough data" responses for valid queries
6. ✅ RPC function includes executives data in results

**CHECKPOINT FINAL:** Report completion with verification results. Frontend agent should NOT start until you confirm all 6 criteria pass.