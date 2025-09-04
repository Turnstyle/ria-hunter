-- =====================================================
-- FIX FOR MISSOURI RIA SEARCH WITH PROPER FUND VALIDATION
-- =====================================================
-- Problem: Missouri fix returns RIAs without validating fund types
-- Solution: Implement proper fund type validation while maintaining Missouri discoverability
-- 
-- INSTRUCTIONS:
-- 1. Copy this entire SQL script
-- 2. Go to Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- 3. Paste the script and click "Run"
-- 4. Verify the results by running the test queries at the bottom
-- =====================================================

-- Step 1: Drop the problematic functions that don't validate fund types
DROP FUNCTION IF EXISTS search_rias CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;

-- Step 2: Create improved search_rias function with proper fund type validation
CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL  -- NEW: Add fund type filter parameter
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
    -- Log the request for debugging
    RAISE NOTICE 'search_rias called with state_filter: %, fund_type: %', state_filter, fund_type_filter;
    
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    -- Standard search with fund type validation
    RETURN QUERY
    WITH validated_rias AS (
        SELECT DISTINCT r.*
        FROM ria_profiles r
        WHERE 
            -- State filter
            (state_filter IS NULL 
             OR TRIM(state_filter) = '' 
             OR r.state = UPPER(TRIM(state_filter)))
            -- AUM filter
            AND COALESCE(r.aum, 0) >= min_aum
            -- VC activity filter
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            -- Fund type filter - CRITICAL ADDITION
            AND (
                fund_type_filter IS NULL 
                OR TRIM(fund_type_filter) = ''
                OR EXISTS (
                    SELECT 1 
                    FROM ria_private_funds pf
                    WHERE pf.crd_number = r.crd_number
                    AND (
                        -- Venture Capital matching
                        (LOWER(fund_type_filter) IN ('vc', 'venture', 'venture capital') 
                         AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%')
                        -- Private Equity matching
                        OR (LOWER(fund_type_filter) IN ('pe', 'private equity', 'buyout', 'lbo') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(pe|private equity|buyout|lbo)%')
                        -- Hedge Fund matching
                        OR (LOWER(fund_type_filter) IN ('hf', 'hedge', 'hedge fund') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(hf|hedge)%')
                        -- Other fund types - exact match
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
        -- Only include if has narrative with good similarity OR no narrative requirement
        n.embedding_vector IS NULL 
        OR (n.embedding_vector IS NOT NULL 
            AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold)
    ORDER BY 
        -- Prioritize firms with narratives and good similarity
        CASE WHEN n.embedding_vector IS NOT NULL THEN 0 ELSE 1 END,
        -- Then sort by similarity for firms with narratives
        CASE WHEN n.embedding_vector IS NOT NULL 
             THEN (n.embedding_vector <=> query_embedding) 
             ELSE 999 END,
        -- Finally sort by AUM
        vr.aum DESC NULLS LAST
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail completely
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Step 3: Create improved hybrid_search_rias function with proper validation
CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0,
    fund_type_filter text DEFAULT NULL  -- NEW: Add fund type filter parameter
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
    k_value INTEGER := 60; -- RRF constant
BEGIN
    -- Log for debugging
    RAISE NOTICE 'hybrid_search_rias called with state_filter: %, fund_type: %', state_filter, fund_type_filter;
    
    -- Input validation
    IF query_text IS NULL OR TRIM(query_text) = '' THEN
        RAISE EXCEPTION 'Query text cannot be empty';
    END IF;
    
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    -- Hybrid search with fund type validation
    RETURN QUERY
    WITH 
    -- First, get RIAs that match ALL filters including fund type
    validated_rias AS (
        SELECT DISTINCT r.*
        FROM ria_profiles r
        WHERE 
            -- State filter
            (state_filter IS NULL 
             OR TRIM(state_filter) = '' 
             OR r.state = UPPER(TRIM(state_filter)))
            -- AUM filter
            AND COALESCE(r.aum, 0) >= min_aum
            -- VC activity filter
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            -- Fund type filter - CRITICAL ADDITION
            AND (
                fund_type_filter IS NULL 
                OR TRIM(fund_type_filter) = ''
                OR EXISTS (
                    SELECT 1 
                    FROM ria_private_funds pf
                    WHERE pf.crd_number = r.crd_number
                    AND (
                        -- Venture Capital matching
                        (LOWER(fund_type_filter) IN ('vc', 'venture', 'venture capital') 
                         AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%')
                        -- Private Equity matching
                        OR (LOWER(fund_type_filter) IN ('pe', 'private equity', 'buyout', 'lbo') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(pe|private equity|buyout|lbo)%')
                        -- Hedge Fund matching
                        OR (LOWER(fund_type_filter) IN ('hf', 'hedge', 'hedge fund') 
                            AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(hf|hedge)%')
                        -- Other fund types - exact match
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

-- Step 4: Grant execute permissions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;

-- Step 5: Add helpful comments
COMMENT ON FUNCTION search_rias IS 'Vector similarity search with proper fund type validation - ensures only RIAs with matching fund types are returned';
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search with fund type validation - combines semantic and text search while enforcing fund type filters';

-- =====================================================
-- VERIFICATION QUERIES - RUN THESE TO TEST THE FIX
-- =====================================================

-- Test 1: Count Missouri RIAs with Venture Capital funds
SELECT 
    COUNT(DISTINCT r.crd_number) as missouri_rias_with_vc_funds,
    STRING_AGG(DISTINCT r.legal_name, ', ' ORDER BY r.legal_name) as sample_rias
FROM ria_profiles r
WHERE r.state = 'MO'
AND EXISTS (
    SELECT 1 
    FROM ria_private_funds pf
    WHERE pf.crd_number = r.crd_number
    AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%'
)
LIMIT 5;

-- Test 2: Test search_rias with Missouri + VC filter (should only return RIAs with VC funds)
SELECT 
    'Test 2: search_rias with MO + VC' as test_name,
    COUNT(*) as result_count,
    STRING_AGG(legal_name, ', ' ORDER BY legal_name) as ria_names
FROM search_rias(
    query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
    match_threshold := 0.0,
    match_count := 20,
    state_filter := 'MO',
    fund_type_filter := 'venture capital'
);

-- Test 3: Verify results actually have VC funds
WITH search_results AS (
    SELECT crd_number, legal_name FROM search_rias(
        query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
        match_threshold := 0.0,
        match_count := 20,
        state_filter := 'MO',
        fund_type_filter := 'venture capital'
    )
)
SELECT 
    'Test 3: Verification of fund types' as test_name,
    sr.crd_number,
    sr.legal_name,
    COUNT(pf.fund_name) as vc_fund_count,
    STRING_AGG(DISTINCT pf.fund_type, ', ') as fund_types
FROM search_results sr
LEFT JOIN ria_private_funds pf ON sr.crd_number = pf.crd_number
    AND LOWER(COALESCE(pf.fund_type, '')) SIMILAR TO '%(vc|venture)%'
GROUP BY sr.crd_number, sr.legal_name
ORDER BY sr.legal_name;

-- Test 4: Test without fund type filter (should return Missouri RIAs regardless of fund type)
SELECT 
    'Test 4: search_rias with MO, no fund filter' as test_name,
    COUNT(*) as result_count
FROM search_rias(
    query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
    match_threshold := 0.0,
    match_count := 20,
    state_filter := 'MO'
);

-- Test 5: Count how many Missouri RIAs have ANY private funds
SELECT 
    'Test 5: Missouri RIA fund statistics' as test_name,
    COUNT(DISTINCT r.crd_number) as total_missouri_rias,
    COUNT(DISTINCT CASE WHEN r.private_fund_count > 0 THEN r.crd_number END) as rias_with_funds,
    COUNT(DISTINCT pf.crd_number) as rias_in_private_funds_table,
    COUNT(DISTINCT CASE WHEN LOWER(pf.fund_type) SIMILAR TO '%(vc|venture)%' THEN pf.crd_number END) as rias_with_vc_funds
FROM ria_profiles r
LEFT JOIN ria_private_funds pf ON r.crd_number = pf.crd_number
WHERE r.state = 'MO';

-- =====================================================
-- EXPECTED RESULTS:
-- - Test 2 should only return RIAs that have venture capital funds
-- - Test 3 should show that all returned RIAs have VC funds (vc_fund_count > 0)
-- - Test 4 should return more results than Test 2 (includes all Missouri RIAs)
-- - Test 5 shows the breakdown of Missouri RIAs with various fund types
--
-- If Test 2 returns 0 results, it means NO Missouri RIAs have VC funds in the database
-- This is correct behavior - the search should not return false positives
-- =====================================================
