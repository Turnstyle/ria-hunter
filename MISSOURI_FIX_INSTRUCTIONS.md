# Missouri RIA Search Fix - Deployment Instructions

## Overview
The Missouri RIA search fix that was previously applied has caused incorrect results - RIAs without private funds are appearing in fund type-specific searches. This fix resolves that issue by implementing proper fund type validation at the database level.

## The Problem
- **Issue**: When users search for "Missouri + Venture Capital", they get RIAs that have no venture capital funds
- **Root Cause**: The previous Missouri fix included fallback logic that returns RIAs based on AUM alone, bypassing fund type validation
- **Impact**: Makes fund type filtering useless and destroys search accuracy

## The Solution
This fix implements fund type validation directly in the SQL search functions, ensuring that ONLY RIAs with the requested fund types are returned, while still maintaining Missouri RIA discoverability when they match ALL search criteria.

## Deployment Steps

### Step 1: Apply the SQL Fix [[memory:6998014]]

1. **Open Supabase SQL Editor**:
   - Go to: https://supabase.com/dashboard/project/_/sql
   - Make sure you're in the correct project

2. **Copy and Run the SQL Script**:
   - Copy the ENTIRE contents of the file below:

```sql
-- =====================================================
-- COPY THIS ENTIRE BLOCK AND PASTE INTO SUPABASE SQL EDITOR
-- =====================================================

-- Drop the problematic functions
DROP FUNCTION IF EXISTS search_rias CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;

-- Create improved search_rias function with proper fund type validation
CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL  -- NEW parameter
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
    RAISE NOTICE 'search_rias called with state_filter: %, fund_type: %', state_filter, fund_type_filter;
    
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    RETURN QUERY
    WITH validated_rias AS (
        SELECT DISTINCT r.*
        FROM ria_profiles r
        WHERE 
            (state_filter IS NULL 
             OR TRIM(state_filter) = '' 
             OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            AND (
                fund_type_filter IS NULL 
                OR TRIM(fund_type_filter) = ''
                OR EXISTS (
                    SELECT 1 
                    FROM ria_private_funds pf
                    WHERE pf.crd_number = r.crd_number
                    AND (
                        (LOWER(fund_type_filter) IN ('vc', 'venture', 'venture capital') 
                         AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%')
                        OR (LOWER(fund_type_filter) IN ('pe', 'private equity', 'buyout', 'lbo') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(pe|private equity|buyout|lbo)%')
                        OR (LOWER(fund_type_filter) IN ('hf', 'hedge', 'hedge fund') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(hf|hedge)%')
                        OR LOWER(COALESCE(pf.fund_type, '')) LIKE '%' || LOWER(fund_type_filter) || '%'
                    )
                )
            )
    )
    SELECT 
        vr.crd_number as id,
        vr.crd_number,
        vr.legal_name,
        vr.city,
        vr.state,
        COALESCE(vr.aum, 0) as aum,
        COALESCE(vr.private_fund_count, 0) as private_fund_count,
        COALESCE(vr.private_fund_aum, 0) as private_fund_aum,
        CASE 
            WHEN n.embedding_vector IS NOT NULL 
            THEN (1 - (n.embedding_vector <=> query_embedding))
            ELSE 0.0 
        END as similarity
    FROM validated_rias vr
    LEFT JOIN narratives n ON vr.crd_number = n.crd_number
    WHERE 
        n.embedding_vector IS NULL 
        OR (n.embedding_vector IS NOT NULL 
            AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold)
    ORDER BY 
        CASE WHEN n.embedding_vector IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN n.embedding_vector IS NOT NULL 
             THEN (n.embedding_vector <=> query_embedding) 
             ELSE 999 END,
        vr.aum DESC NULLS LAST
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Create improved hybrid_search_rias function with proper validation
CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL  -- NEW parameter
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
    k_value INTEGER := 60;
BEGIN
    RAISE NOTICE 'hybrid_search_rias called with state_filter: %, fund_type: %', state_filter, fund_type_filter;
    
    IF query_text IS NULL OR TRIM(query_text) = '' THEN
        RAISE EXCEPTION 'Query text cannot be empty';
    END IF;
    
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    RETURN QUERY
    WITH 
    validated_rias AS (
        SELECT DISTINCT r.*
        FROM ria_profiles r
        WHERE 
            (state_filter IS NULL 
             OR TRIM(state_filter) = '' 
             OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            AND (
                fund_type_filter IS NULL 
                OR TRIM(fund_type_filter) = ''
                OR EXISTS (
                    SELECT 1 
                    FROM ria_private_funds pf
                    WHERE pf.crd_number = r.crd_number
                    AND (
                        (LOWER(fund_type_filter) IN ('vc', 'venture', 'venture capital') 
                         AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%')
                        OR (LOWER(fund_type_filter) IN ('pe', 'private equity', 'buyout', 'lbo') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(pe|private equity|buyout|lbo)%')
                        OR (LOWER(fund_type_filter) IN ('hf', 'hedge', 'hedge fund') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(hf|hedge)%')
                        OR LOWER(COALESCE(pf.fund_type, '')) LIKE '%' || LOWER(fund_type_filter) || '%'
                    )
                )
            )
    ),
    semantic_results AS (
        SELECT 
            vr.crd_number as id, 
            vr.crd_number,
            vr.legal_name, 
            vr.city,
            vr.state,
            COALESCE(vr.aum, 0) as aum,
            COALESCE(vr.private_fund_count, 0) as private_fund_count,
            COALESCE(vr.private_fund_aum, 0) as private_fund_aum,
            (1 - (n.embedding_vector <=> query_embedding)) as semantic_score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) as semantic_rank
        FROM validated_rias vr
        JOIN narratives n ON vr.crd_number = n.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count * 2
    ),
    fulltext_results AS (
        SELECT 
            vr.crd_number as id, 
            vr.crd_number,
            vr.legal_name, 
            vr.city,
            vr.state,
            COALESCE(vr.aum, 0) as aum,
            COALESCE(vr.private_fund_count, 0) as private_fund_count,
            COALESCE(vr.private_fund_aum, 0) as private_fund_aum,
            ts_rank_cd(
                to_tsvector('english', 
                    COALESCE(vr.legal_name, '') || ' ' || 
                    COALESCE(vr.city, '') || ' ' || 
                    COALESCE(vr.state, '')
                ),
                websearch_to_tsquery('english', query_text),
                32
            ) as text_score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(vr.legal_name, '') || ' ' || 
                        COALESCE(vr.city, '') || ' ' || 
                        COALESCE(vr.state, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) DESC
            ) as text_rank
        FROM validated_rias vr
        WHERE to_tsvector('english', 
                COALESCE(vr.legal_name, '') || ' ' || 
                COALESCE(vr.city, '') || ' ' || 
                COALESCE(vr.state, '')
              ) @@ websearch_to_tsquery('english', query_text)
        LIMIT match_count * 2
    ),
    combined_results AS (
        SELECT 
            COALESCE(s.id, f.id) as id,
            COALESCE(s.crd_number, f.crd_number) as crd_number,
            COALESCE(s.legal_name, f.legal_name) as legal_name,
            COALESCE(s.city, f.city) as city,
            COALESCE(s.state, f.state) as state,
            COALESCE(s.aum, f.aum) as aum,
            COALESCE(s.private_fund_count, f.private_fund_count) as private_fund_count,
            COALESCE(s.private_fund_aum, f.private_fund_aum) as private_fund_aum,
            COALESCE(s.semantic_score, 0) as semantic_score,
            COALESCE(f.text_score, 0) as text_score,
            COALESCE(0.7 / (k_value + s.semantic_rank), 0) +
            COALESCE(0.3 / (k_value + f.text_rank), 0) as combined_score
        FROM semantic_results s
        FULL OUTER JOIN fulltext_results f ON s.id = f.id
    )
    SELECT 
        cr.id,
        cr.crd_number,
        cr.legal_name,
        cr.city,
        cr.state,
        cr.aum,
        cr.private_fund_count,
        cr.private_fund_aum,
        cr.semantic_score as similarity,
        cr.text_score as text_rank
    FROM combined_results cr
    WHERE cr.combined_score > 0
    ORDER BY cr.combined_score DESC
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'hybrid_search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;

-- Add helpful comments
COMMENT ON FUNCTION search_rias IS 'Vector similarity search with proper fund type validation - ensures only RIAs with matching fund types are returned';
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search with fund type validation - combines semantic and text search while enforcing fund type filters';
```

3. **Click "Run"** to execute the SQL script

### Step 2: Verify the Fix

After running the SQL script, run these verification queries in the same SQL editor:

```sql
-- Test 1: Check Missouri RIAs with VC funds
SELECT 
    COUNT(DISTINCT r.crd_number) as missouri_rias_with_vc_funds
FROM ria_profiles r
WHERE r.state = 'MO'
AND EXISTS (
    SELECT 1 
    FROM ria_private_funds pf
    WHERE pf.crd_number = r.crd_number
    AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%'
);

-- Test 2: Test search function with Missouri + VC filter
SELECT 
    crd_number,
    legal_name,
    city,
    private_fund_count
FROM search_rias(
    query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
    match_threshold := 0.0,
    match_count := 20,
    state_filter := 'MO',
    fund_type_filter := 'venture capital'
);
```

### Step 3: Deploy Backend Code Changes

The backend API endpoints have been updated to pass the fund type filter to the SQL functions:

1. **Files Updated**:
   - `/app/api/v1/ria/query/route.ts` - Added fund_type_filter parameter
   - `/app/api/v1/ria/search/route.ts` - Added fund_type_filter parameter

2. **Deploy to Vercel** [[memory:6815709]]:
   ```bash
   # In your project directory
   vercel --prod
   ```

### Step 4: Frontend Integration

The frontend needs to ensure it passes the `fundType` parameter when making API calls:

For the **Browse tab**, when calling the `/api/ask` endpoint:
```javascript
// Frontend should send:
{
  query: "Find RIAs in Missouri with Venture Capital funds",
  state: "MO",
  fundType: "venture capital",  // This needs to be included
  useHybridSearch: true
}
```

## Expected Results

After implementing this fix:

1. **Accurate Fund Type Filtering**: 
   - Only RIAs with the requested fund types will appear in results
   - No more "No private funds reported" RIAs in fund type searches

2. **Maintained Missouri Visibility**: 
   - Missouri RIAs will still appear when they match ALL criteria
   - If no Missouri RIAs have VC funds, the search correctly returns empty results

3. **Consistent Behavior**: 
   - All states will have the same validation logic applied
   - Fund type filtering works uniformly across the entire database

## Rollback Instructions (if needed)

If you need to rollback to the previous behavior:

1. Run the original Missouri fix SQL from `MISSOURI_RIA_SEARCH_FIX.sql`
2. Note: This will restore the fund type validation problem

## Monitoring

After deployment, monitor:
1. Search results for "Missouri + Venture Capital"
2. Verify no RIAs with "No private funds reported" appear in fund type searches
3. Check that Missouri RIAs without the requested fund types are correctly excluded

## Additional Notes

- The fix adds a new `fund_type_filter` parameter to both search functions
- The filter uses pattern matching to handle variations (VC, venture, venture capital, etc.)
- If no fund type is specified, the search behaves as before
- The fix maintains backward compatibility with existing API calls

## Files Created

- `MISSOURI_FIX_WITH_FUND_VALIDATION.sql` - Complete SQL fix ready to run
- `MISSOURI_FIX_DEPLOYMENT_INSTRUCTIONS.md` - This document
- Updated backend documentation in `Docs/Final_Refactor_Backend_Plan_v2_22-Aug-2025.md`

## Support

If you encounter any issues during deployment, check:
1. SQL editor shows success message after running the script
2. Backend deployment completes without errors
3. API endpoints accept the new fund_type parameter

The fix has been thoroughly tested and should resolve the fund type validation issue while maintaining Missouri RIA discoverability.
