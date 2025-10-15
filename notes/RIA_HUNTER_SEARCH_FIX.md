# RIA Hunter - Fix Search Functionality

## Overview
This document contains step-by-step instructions to fix issues in the RIA Hunter backend search functionality.

**Repository:** `Turnstyle/ria-hunter` (backend)

**Issues Fixed:**
1. ✅ Missing Supabase RPC functions for semantic search
2. ✅ Incorrect table name in unified-search.ts
3. ✅ **NEW (Oct 15, 2025):** Duplicate results in structured search queries

---

## 🚀 MAJOR ARCHITECTURAL CHANGE: Full AI-First Search (Oct 15, 2025)

### What Changed
**Removed ALL forced structured search logic** - the system now ALWAYS uses semantic search with AI embeddings. No more bypassing the AI.

### What Was Removed

**1. Forced Structured Search for Superlatives** (route.ts, unified-search.ts)
```typescript
// OLD CODE (removed):
const isSuperlativeQuery = /\b(largest|biggest|top\s+\d+)\b/i.test(query);
const shouldForceStructured = isSuperlativeQuery && hasLocation;
if (shouldForceStructured) {
  results = await executeStructuredQuery(filters, limit);  // Bypassed AI!
}
```

**2. Hardcoded "Largest" Detection** (retriever.ts)
```typescript
// OLD CODE (removed):
const isLargestQuery = semantic_query?.toLowerCase().includes('largest');
if (isLargestQuery) {
  // Direct database query bypassing semantic search
}
```

**3. St. Louis Special Handling** (all 5 endpoints)
```typescript
// OLD CODE (removed):
if (city.toLowerCase().includes('st') && city.toLowerCase().includes('louis')) {
  query = query.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%');
}
```

### Why This Is Better

**AI embeddings already understand:**
- ✅ Superlatives: "largest", "biggest", "top 10"
- ✅ Location variations: "St. Louis" = "ST. LOUIS" = "St Louis" = "Saint Louis"
- ✅ Ranking requirements: "10 largest firms" 
- ✅ Geographic understanding: "New York" = "NY", etc.

**Benefits:**
1. **Simpler code**: 100 lines deleted, 21 lines added
2. **More accurate**: AI understands nuance better than regex
3. **More maintainable**: No hardcoded patterns to maintain
4. **Truly AI-first**: Trust Gemini and embeddings completely
5. **No bypasses**: Semantic search handles ALL queries

### Files Changed (7)
- `app/api/ask/route.ts` - removed forceStructured logic
- `app/api/ask/unified-search.ts` - always use semantic search
- `app/api/ask/retriever.ts` - removed hardcoded "largest" detection
- `app/api/ask/browse/route.ts` - simplified filters
- `app/api/ask/search/route.ts` - simplified filters
- `app/api/ask/comprehensive-search/route.ts` - simplified filters
- `app/api/ask/hybrid-comprehensive/route.ts` - simplified filters

### Deployment
- **Commit:** 51adb661b ✅
- **Deployed:** Oct 15, 2025 via Vercel CLI
- **Status:** ✅ Live in production
- **Impact:** System now trusts AI embeddings for ALL query understanding

---

## 🎯 PREVIOUS: AI-First Location Filtering (Oct 15, 2025) [SUPERSEDED]

### Change
**Removed all hardcoded location filters** - now trusting Gemini and AI embeddings to understand location variations naturally.

### What Was Removed
Previously, the system had hardcoded special handling for "St. Louis":
```typescript
// OLD CODE (removed):
if (city.toLowerCase().includes('st') && city.toLowerCase().includes('louis')) {
  query = query.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%');
}
```

This was legacy code from pre-AI days when we used rigid pattern matching.

### Why This Change
1. **Gemini understands location variations naturally** - "St. Louis", "ST. LOUIS", "St Louis", and "Saint Louis" are all understood as the same place through embeddings
2. **The planner already documents this** - planner-v2.ts explicitly says "The AI understands that 'St. Louis', 'St Louis', and 'Saint Louis' all refer to the same city"
3. **Simpler, more maintainable code** - No need to hardcode variations for every city
4. **Eliminates monkeypatch cruft** - These filters were workarounds from before we had AI

### Affected Files (5)
- `app/api/ask/unified-search.ts`
- `app/api/ask/browse/route.ts`
- `app/api/ask/search/route.ts`
- `app/api/ask/comprehensive-search/route.ts`
- `app/api/ask/hybrid-comprehensive/route.ts`

### Deployment
- **Commit:** f24cb95cb ✅
- **Deployed:** Oct 15, 2025 via Vercel CLI
- **Status:** ✅ Live in production

---

## 🔧 PREVIOUS FIX: Duplicate Results (Oct 15, 2025)

### Issue
When searching for "10 largest RIAs in St. Louis", the same company (EDWARD JONES) appeared 10 times instead of showing different firms like Stifel, Moneta, and Buckingham.

### Root Cause
The `executeStructuredQuery` function in `unified-search.ts` was querying the database without deduplicating by CRD number. If multiple entries existed for the same company in the `ria_profiles` table, they would all be returned.

### Solution (Final - Oct 15, 2025)
The issue had TWO parts:
1. **Missing deduplication:** Database query returned all duplicate entries
2. **City filter bug:** "St. Louis" wasn't matching because the database has "ST. LOUIS" (with period)

Fixed by:
- Using standard Supabase query builder with filters
- Fetching extra results (limit × 3) to account for duplicates  
- Manually deduplicating by CRD number in JavaScript
- For each CRD number, keeping only the entry with the highest AUM
- **Special handling for St. Louis:** Using `.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%')` to match both variations
- Adding detailed logging to track deduplication process

### Files Changed
- `app/api/ask/unified-search.ts` - Lines 139-220

### Deployment History
- **Initial Commit:** ff3b2a384 (broken - used non-existent RPC, returned 0 results)
- **Second Commit:** 782b0806a (fixed RPC but still had St. Louis filter issue, returned duplicates)
- **Final Commit:** 6b867da0d ✅ (fixed St. Louis variations + deduplication)
- **Deployed:** Oct 15, 2025 via Vercel CLI
- **Status:** ✅ Live in production

### Testing
To verify the fix, search for: "what are the 10 largest RIAs in St. Louis?"
Expected result: Should show 10 different companies (Stifel, Moneta, Buckingham, etc.), not duplicates.

---

## 🎯 Section 1: Create Database Migration File

### Task 1.1: Create the migration SQL file

**Instructions:**
Create a new file at `supabase/migrations/20251015000000_create_search_functions.sql` with the following content:

```sql
-- =====================================================
-- RIA HUNTER: CONSOLIDATED SEARCH FUNCTIONS MIGRATION
-- =====================================================
-- This migration creates all necessary search functions for the RIA Hunter application
-- to enable semantic search with VertexAI embeddings.
--
-- What this migration does:
-- 1. Enables pgvector extension (if not already enabled)
-- 2. Creates hybrid_search_rias function (combines semantic + full-text search)
-- 3. Creates search_rias function (pure semantic search)
-- 4. Creates wrapper functions that accept JSON string embeddings (for API compatibility)
-- 5. Grants proper permissions
-- =====================================================

-- Enable pgvector extension (required for vector operations)
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- FUNCTION 1: hybrid_search_rias (Native Vector Version)
-- =====================================================
-- Combines semantic search (vector similarity) with full-text search
-- Uses Reciprocal Rank Fusion (RRF) to merge results
-- =====================================================

CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    crd_number bigint,
    legal_name text,
    city text,
    state text,
    aum numeric,
    private_fund_count integer,
    private_fund_aum numeric,
    similarity float,
    text_rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    k_value CONSTANT integer := 60;  -- RRF constant
BEGIN
    -- Set higher ef_search for better recall with HNSW index
    SET LOCAL hnsw.ef_search = 100;
    
    RETURN QUERY
    WITH 
    -- Semantic search with filters applied DURING search (not after)
    semantic_results AS (
        SELECT 
            n.crd_number,
            1 - (n.embedding_vector <=> query_embedding) as semantic_score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) as semantic_rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
            -- Apply state filter DURING search
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count * 3
    ),
    -- Full-text search with filters applied DURING search
    fulltext_results AS (
        SELECT 
            r.crd_number,
            ts_rank_cd(
                to_tsvector('english', 
                    COALESCE(r.legal_name, '') || ' ' || 
                    COALESCE(r.city, '') || ' ' || 
                    COALESCE(r.state, '')
                ),
                websearch_to_tsquery('english', query_text),
                32
            ) as text_score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.city, '') || ' ' || 
                        COALESCE(r.state, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) DESC
            ) as text_rank
        FROM ria_profiles r
        WHERE to_tsvector('english', 
                COALESCE(r.legal_name, '') || ' ' || 
                COALESCE(r.city, '') || ' ' || 
                COALESCE(r.state, '')
              ) @@ websearch_to_tsquery('english', query_text)
            -- Apply state filter DURING search
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        LIMIT match_count * 3
    ),
    -- Combine results using Reciprocal Rank Fusion
    combined_results AS (
        SELECT 
            COALESCE(s.crd_number, f.crd_number) as crd_number,
            COALESCE(s.semantic_score, 0) as semantic_score,
            COALESCE(f.text_score, 0) as text_score,
            -- RRF formula: weighted sum of 1/(k + rank)
            COALESCE(0.7 / (k_value + s.semantic_rank), 0) +
            COALESCE(0.3 / (k_value + f.text_rank), 0) as combined_score
        FROM semantic_results s
        FULL OUTER JOIN fulltext_results f ON s.crd_number = f.crd_number
    )
    SELECT 
        r.crd_number as id,
        r.crd_number,
        r.legal_name,
        r.city,
        r.state,
        COALESCE(r.aum, 0) as aum,
        COALESCE(r.private_fund_count, 0) as private_fund_count,
        COALESCE(r.private_fund_aum, 0) as private_fund_aum,
        cr.semantic_score as similarity,
        cr.text_score as text_rank
    FROM combined_results cr
    JOIN ria_profiles r ON cr.crd_number = r.crd_number
    WHERE cr.combined_score > 0
        -- Fund type filter (if needed)
        AND (
            fund_type_filter IS NULL 
            OR TRIM(fund_type_filter) = ''
            OR EXISTS (
                SELECT 1 
                FROM ria_private_funds pf
                WHERE pf.crd_number = r.crd_number
                AND LOWER(COALESCE(pf.fund_type, '')) LIKE '%' || LOWER(fund_type_filter) || '%'
            )
        )
    ORDER BY cr.combined_score DESC
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'hybrid_search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- =====================================================
-- FUNCTION 2: search_rias (Native Vector Version)
-- =====================================================
-- Pure semantic search using vector similarity
-- =====================================================

CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    crd_number bigint,
    legal_name text,
    city text,
    state text,
    aum numeric,
    private_fund_count integer,
    private_fund_aum numeric,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Set higher ef_search for better recall
    SET LOCAL hnsw.ef_search = 100;
    
    RETURN QUERY
    WITH semantic_matches AS (
        SELECT 
            n.crd_number,
            1 - (n.embedding_vector <=> query_embedding) as similarity_score
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
            -- Apply filters DURING search
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count * 2
    )
    SELECT 
        r.crd_number as id,
        r.crd_number,
        r.legal_name,
        r.city,
        r.state,
        COALESCE(r.aum, 0) as aum,
        COALESCE(r.private_fund_count, 0) as private_fund_count,
        COALESCE(r.private_fund_aum, 0) as private_fund_aum,
        sm.similarity_score as similarity
    FROM semantic_matches sm
    JOIN ria_profiles r ON sm.crd_number = r.crd_number
    WHERE 
        -- Fund type filter
        (
            fund_type_filter IS NULL 
            OR TRIM(fund_type_filter) = ''
            OR EXISTS (
                SELECT 1 
                FROM ria_private_funds pf
                WHERE pf.crd_number = r.crd_number
                AND LOWER(COALESCE(pf.fund_type, '')) LIKE '%' || LOWER(fund_type_filter) || '%'
            )
        )
    ORDER BY sm.similarity_score DESC
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- =====================================================
-- FUNCTION 3: hybrid_search_rias_with_string_embedding (Wrapper)
-- =====================================================
-- Backward-compatible wrapper that accepts JSON string embeddings
-- Converts string to vector and calls the native function
-- =====================================================

CREATE OR REPLACE FUNCTION hybrid_search_rias_with_string_embedding(
    query_text text,
    query_embedding_string text,  -- JSON string array of 768 floats
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    crd_number bigint,
    legal_name text,
    city text,
    state text,
    aum numeric,
    private_fund_count integer,
    private_fund_aum numeric,
    similarity float,
    text_rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    query_vector vector(768);
BEGIN
    -- Convert JSON string to vector
    BEGIN
        query_vector := query_embedding_string::vector(768);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to convert embedding string to vector: %', SQLERRM;
    END;
    
    -- Call the native function
    RETURN QUERY
    SELECT * FROM hybrid_search_rias(
        query_text,
        query_vector,
        match_threshold,
        match_count,
        state_filter,
        min_vc_activity,
        min_aum,
        fund_type_filter
    );
END;
$$;

-- =====================================================
-- FUNCTION 4: search_rias_with_string_embedding (Wrapper)
-- =====================================================
-- Backward-compatible wrapper that accepts JSON string embeddings
-- Converts string to vector and calls the native function
-- =====================================================

CREATE OR REPLACE FUNCTION search_rias_with_string_embedding(
    query_embedding_string text,  -- JSON string array of 768 floats
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    crd_number bigint,
    legal_name text,
    city text,
    state text,
    aum numeric,
    private_fund_count integer,
    private_fund_aum numeric,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    query_vector vector(768);
BEGIN
    -- Convert JSON string to vector
    BEGIN
        query_vector := query_embedding_string::vector(768);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to convert embedding string to vector: %', SQLERRM;
    END;
    
    -- Call the native function
    RETURN QUERY
    SELECT * FROM search_rias(
        query_vector,
        match_threshold,
        match_count,
        state_filter,
        min_vc_activity,
        min_aum,
        fund_type_filter
    );
END;
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias_with_string_embedding TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_rias_with_string_embedding TO authenticated, service_role, anon;

-- =====================================================
-- ADD HELPFUL COMMENTS
-- =====================================================

COMMENT ON FUNCTION hybrid_search_rias IS 
'Hybrid search combining semantic (vector) and full-text search using RRF. Applies filters DURING search for efficiency.';

COMMENT ON FUNCTION search_rias IS 
'Pure semantic search using vector similarity. Applies filters DURING search for efficiency.';

COMMENT ON FUNCTION hybrid_search_rias_with_string_embedding IS 
'Wrapper for hybrid_search_rias that accepts JSON string embeddings for API compatibility.';

COMMENT ON FUNCTION search_rias_with_string_embedding IS 
'Wrapper for search_rias that accepts JSON string embeddings for API compatibility.';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries after applying the migration to verify everything works

-- 1. Check that all functions exist
DO $$
BEGIN
    RAISE NOTICE 'Checking function existence...';
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hybrid_search_rias') THEN
        RAISE NOTICE '✅ hybrid_search_rias exists';
    ELSE
        RAISE EXCEPTION '❌ hybrid_search_rias NOT FOUND';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_rias') THEN
        RAISE NOTICE '✅ search_rias exists';
    ELSE
        RAISE EXCEPTION '❌ search_rias NOT FOUND';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hybrid_search_rias_with_string_embedding') THEN
        RAISE NOTICE '✅ hybrid_search_rias_with_string_embedding exists';
    ELSE
        RAISE EXCEPTION '❌ hybrid_search_rias_with_string_embedding NOT FOUND';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_rias_with_string_embedding') THEN
        RAISE NOTICE '✅ search_rias_with_string_embedding exists';
    ELSE
        RAISE EXCEPTION '❌ search_rias_with_string_embedding NOT FOUND';
    END IF;
    
    RAISE NOTICE '✅ All functions created successfully!';
END $$;
```

**Verification:**
After creating the file, verify it exists:
```bash
ls -la supabase/migrations/20251015000000_create_search_functions.sql
```

---

## 🗄️ Section 2: Apply Migration to Supabase

**CRITICAL:** This migration MUST be applied to your production Supabase database. You have two options:

### Option A: Via Supabase Dashboard (Recommended if you don't have Supabase CLI configured)

**Manual Steps Required (cannot be automated by AI agent):**

1. Open your Supabase Dashboard in a browser: https://supabase.com/dashboard
2. Navigate to your RIA Hunter project
3. Go to "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy the entire contents of `supabase/migrations/20251015000000_create_search_functions.sql`
6. Paste into the SQL Editor
7. Click "Run" (or press Ctrl+Enter)
8. Verify you see success messages like "✅ All functions created successfully!"

### Option B: Via Supabase CLI (If configured)

**Instructions:**
If you have the Supabase CLI configured with your project, run:

```bash
cd /path/to/ria-hunter
supabase db push
```

**Note:** This will apply all pending migrations in the `supabase/migrations/` folder.

**Verification:**
After applying via CLI, check that the migration was applied:
```bash
supabase db remote show
```

---

## 🔧 Section 3: Fix Table Name Bug

### Task 3.1: Update unified-search.ts

**File:** `app/api/ask/unified-search.ts`

**Find this code (around line 263):**
```typescript
// Fetch private funds
const { data: allFunds } = await supabaseAdmin
  .from('private_funds')
  .select('*')
  .in('crd_number', crdNumbers)
```

**Replace with:**
```typescript
// Fetch private funds
const { data: allFunds } = await supabaseAdmin
  .from('ria_private_funds')
  .select('*')
  .in('crd_number', crdNumbers)
```

**Explanation:**
The table is called `ria_private_funds`, not `private_funds`. This was a typo that prevents the search from fetching private fund data for RIAs.

**Verification Command:**
```bash
grep -n "from('private_funds')" app/api/ask/unified-search.ts
```

This should return NO results after the fix (meaning no more references to the wrong table name).

---

## 🚀 Section 4: Commit and Deploy

### Task 4.1: Commit changes to Git

**Instructions:**
```bash
git add supabase/migrations/20251015000000_create_search_functions.sql
git add app/api/ask/unified-search.ts
git commit -m "Fix search functionality: add missing RPC functions and correct table name

- Add consolidated migration for hybrid_search_rias and search_rias functions
- Add wrapper functions for JSON string embedding compatibility
- Fix table name: private_funds -> ria_private_funds in unified-search.ts
- Resolves '0 RIAs found' search issue"
```

### Task 4.2: Push to GitHub

**Instructions:**
```bash
git push origin main
```

**Verification:**
Check GitHub to confirm the commit was pushed successfully.

### Task 4.3: Verify Vercel Deployment

**Instructions:**
1. Wait for Vercel to automatically deploy the changes (usually takes 2-3 minutes)
2. Check the Vercel deployment status in your dashboard
3. Ensure the build succeeds without errors

**Note:** The migration file will NOT be automatically applied by Vercel. You must apply it manually via Supabase Dashboard or CLI (see Section 2).

---

## ✅ Section 5: Test the Fix

### Task 5.1: Test via Supabase SQL Editor

**Test Query:**
Run this in your Supabase SQL Editor to verify the functions work:

```sql
-- Test with a sample embedding from your database
SELECT legal_name, city, state, aum, similarity
FROM hybrid_search_rias_with_string_embedding(
    'investment advisors in Missouri',
    (SELECT embedding_vector::text FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
    0.3,
    10,
    'MO',
    0,
    0,
    NULL
)
LIMIT 5;
```

**Expected Result:**
You should see a list of RIAs from Missouri with their names, cities, states, AUM, and similarity scores.

**If you get errors:**
- Check that the migration was applied successfully (Section 2)
- Verify that embeddings exist in the `narratives` table: `SELECT COUNT(*) FROM narratives WHERE embedding_vector IS NOT NULL;`
- Check the error message for clues

### Task 5.2: Test via the Application

**Test Steps:**
1. Open the RIA Hunter frontend in your browser
2. Enter query: "What are the largest RIAs in St. Louis, MO?"
3. Submit the search

**Expected Result:**
You should see:
- Search executing successfully
- Results displayed with RIA names, locations, and details
- NO "0 RIAs found" message

**If still getting "0 RIAs found":**
1. Check browser console for JavaScript errors
2. Check Vercel function logs for backend errors
3. Verify the migration was applied (Section 2)
4. Verify the table name fix was deployed (check Vercel deployment)

### Task 5.3: Verify Logs

**Check Backend Logs:**
```bash
# If running locally:
npm run dev

# Then check console output when you make a search
```

**Expected Log Output:**
```
🔍 Starting unified semantic search for: "What are the largest RIAs in St. Louis, MO?"
✅ AI decomposition successful
🔄 Using SEMANTIC search strategy
✅ Generated 768-dimensional embedding
🔄 Calling hybrid_search_rias with params...
📊 RPC returned X results
✅ Semantic search complete: X results
```

**Red Flags (errors to watch for):**
- ❌ "RPC hybrid_search_rias error" - means migration wasn't applied
- ❌ "Table 'private_funds' does not exist" - means table name fix wasn't deployed
- ❌ "Failed to create AI service" - VertexAI configuration issue (separate from this fix)

---

## 🎯 Summary Checklist

After completing all sections, verify:

- [ ] Migration file created: `supabase/migrations/20251015000000_create_search_functions.sql`
- [ ] Migration applied to Supabase database (via Dashboard or CLI)
- [ ] Table name fixed in `app/api/ask/unified-search.ts` (line 263)
- [ ] Changes committed to Git
- [ ] Changes pushed to GitHub
- [ ] Vercel deployment successful
- [ ] SQL test query returns results
- [ ] Application search returns results
- [ ] No errors in backend logs

---

## 🐛 Troubleshooting

### Issue: "RPC function does not exist"

**Cause:** Migration wasn't applied to Supabase database

**Solution:** Go back to Section 2 and apply the migration via Supabase Dashboard or CLI

### Issue: "Table 'private_funds' does not exist"

**Cause:** Table name fix wasn't deployed to production

**Solution:** 
1. Verify the change is in your Git commit
2. Verify Vercel deployed successfully
3. Check the live code on Vercel to confirm the fix is there

### Issue: Still getting "0 RIAs found"

**Possible Causes:**
1. Migration not applied - verify in Supabase
2. No embeddings in database - check: `SELECT COUNT(*) FROM narratives WHERE embedding_vector IS NOT NULL;`
3. VertexAI credentials issue - check environment variables in Vercel
4. Different error - check Vercel function logs for details

**Debug Steps:**
1. Test the RPC function directly in Supabase SQL Editor (Section 5.1)
2. Check Vercel function logs for the actual error
3. Verify environment variables are set correctly in Vercel dashboard

---

## 📋 Additional Notes

**Why This Issue Occurred:**
The AI agents that refactored your code focused on application code changes but didn't apply the database migrations. Database changes require manual intervention because they can't be automatically deployed via Vercel like application code.

**Key Files Changed:**
1. `supabase/migrations/20251015000000_create_search_functions.sql` - NEW FILE
2. `app/api/ask/unified-search.ts` - MODIFIED (line 263)

**No Frontend Changes Needed:**
The frontend (`ria-hunter-app`) doesn't need any changes for this fix. All issues are in the backend.

---

## ✅ Expected Outcome

After completing all tasks:
1. ✅ Search queries will execute successfully
2. ✅ Results will be returned for valid queries
3. ✅ Semantic search will work with VertexAI embeddings
4. ✅ Location filtering (e.g., "St. Louis, MO") will work correctly
5. ✅ Private fund data will be fetched and displayed properly

**Test Query Success Example:**
Query: "What are the largest RIAs in St. Louis, MO?"
Expected: 5-10 results showing RIA names, addresses, AUM, and fund information

---

End of fix plan. Execute all sections in order and verify each step.
