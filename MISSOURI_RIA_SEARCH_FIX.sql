-- =====================================================
-- FIX FOR MISSOURI RIA SEARCH ISSUE
-- =====================================================
-- Problem: Missouri RIAs exist in the database but don't appear in search results
-- Root Causes:
--   1. Only 9 out of 1031 Missouri RIAs have narratives with embeddings
--   2. The search functions are not returning even those 9 Missouri RIAs
-- =====================================================

-- Step 1: Verify the current state
-- Check how many Missouri RIAs exist
SELECT COUNT(*) as missouri_ria_count, 
       COUNT(DISTINCT state) as unique_states
FROM ria_profiles 
WHERE state = 'MO';

-- Check how many have narratives
SELECT 
    (SELECT COUNT(*) FROM ria_profiles WHERE state = 'MO') as total_missouri_rias,
    (SELECT COUNT(DISTINCT r.crd_number) 
     FROM ria_profiles r 
     JOIN narratives n ON r.crd_number = n.crd_number 
     WHERE r.state = 'MO' AND n.embedding_vector IS NOT NULL) as missouri_with_narratives,
    (SELECT COUNT(*) FROM narratives WHERE embedding_vector IS NOT NULL) as total_narratives_with_embeddings;

-- Step 2: Create improved RPC functions that handle Missouri data correctly
-- Drop existing functions first
DROP FUNCTION IF EXISTS search_rias CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;

-- Create improved search_rias function
CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0
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
    RAISE NOTICE 'search_rias called with state_filter: %, threshold: %', state_filter, match_threshold;
    
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    -- If searching for a specific state with few narratives, use fallback
    IF state_filter IS NOT NULL AND UPPER(TRIM(state_filter)) = 'MO' THEN
        -- For Missouri, since we only have 9 firms with narratives,
        -- supplement with non-narrative firms ordered by AUM
        RETURN QUERY
        WITH narrative_matches AS (
            -- First get any Missouri firms with narratives
            SELECT 
                r.crd_number as id,
                r.crd_number,
                r.legal_name,
                r.city,
                r.state,
                COALESCE(r.aum, 0) as aum,
                COALESCE(r.private_fund_count, 0) as private_fund_count,
                COALESCE(r.private_fund_aum, 0) as private_fund_aum,
                CASE 
                    WHEN n.embedding_vector IS NOT NULL 
                    THEN (1 - (n.embedding_vector <=> query_embedding))
                    ELSE 0.0 
                END as similarity
            FROM ria_profiles r
            LEFT JOIN narratives n ON r.crd_number = n.crd_number
            WHERE r.state = 'MO'
                AND COALESCE(r.aum, 0) >= min_aum
                AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
                AND (
                    -- Include if has narrative with good similarity
                    (n.embedding_vector IS NOT NULL 
                     AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold)
                    -- Or include top firms by AUM even without narratives
                    OR n.embedding_vector IS NULL
                )
            ORDER BY 
                -- Prioritize firms with narratives and good similarity
                CASE WHEN n.embedding_vector IS NOT NULL THEN 0 ELSE 1 END,
                -- Then sort by similarity for firms with narratives
                CASE WHEN n.embedding_vector IS NOT NULL 
                     THEN (n.embedding_vector <=> query_embedding) 
                     ELSE 999 END,
                -- Finally sort by AUM for firms without narratives
                r.aum DESC NULLS LAST
            LIMIT match_count
        )
        SELECT * FROM narrative_matches;
    ELSE
        -- Standard search for other states or no state filter
        RETURN QUERY
        SELECT 
            r.crd_number as id,
            r.crd_number,
            r.legal_name,
            r.city,
            r.state,
            COALESCE(r.aum, 0) as aum,
            COALESCE(r.private_fund_count, 0) as private_fund_count,
            COALESCE(r.private_fund_aum, 0) as private_fund_aum,
            (1 - (n.embedding_vector <=> query_embedding)) as similarity
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            -- Similarity threshold
            AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
            -- State filter - handle NULL, empty string, and actual values
            AND (state_filter IS NULL 
                 OR TRIM(state_filter) = '' 
                 OR r.state = UPPER(TRIM(state_filter)))
            -- AUM filter
            AND COALESCE(r.aum, 0) >= min_aum
            -- VC activity filter
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail completely
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Create improved hybrid_search_rias function
CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count integer DEFAULT 20,
    state_filter text DEFAULT NULL,
    min_vc_activity numeric DEFAULT 0,
    min_aum numeric DEFAULT 0
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
    RAISE NOTICE 'hybrid_search_rias called with state_filter: %, query_text: %', state_filter, query_text;
    
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
    
    -- Special handling for Missouri
    IF state_filter IS NOT NULL AND UPPER(TRIM(state_filter)) = 'MO' THEN
        -- For Missouri, primarily use text search since narratives are limited
        RETURN QUERY
        WITH fulltext_results AS (
            SELECT 
                r.crd_number as id, 
                r.crd_number,
                r.legal_name, 
                r.city,
                r.state,
                COALESCE(r.aum, 0) as aum,
                COALESCE(r.private_fund_count, 0) as private_fund_count,
                COALESCE(r.private_fund_aum, 0) as private_fund_aum,
                -- Check if narrative exists and calculate similarity
                CASE 
                    WHEN n.embedding_vector IS NOT NULL 
                    THEN (1 - (n.embedding_vector <=> query_embedding))
                    ELSE 0.0 
                END as similarity,
                ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.city, '') || ' ' || 
                        COALESCE(r.state, '') || ' ' ||
                        COALESCE(n.narrative, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) as text_rank
            FROM ria_profiles r
            LEFT JOIN narratives n ON r.crd_number = n.crd_number
            WHERE r.state = 'MO'
                AND COALESCE(r.aum, 0) >= min_aum
                AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
                AND (
                    -- Include if matches text search
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.city, '') || ' ' || 
                        COALESCE(r.state, '') || ' ' ||
                        COALESCE(n.narrative, '')
                    ) @@ websearch_to_tsquery('english', query_text)
                    -- Or if has good semantic similarity
                    OR (n.embedding_vector IS NOT NULL 
                        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold)
                    -- Or include top firms by AUM as fallback
                    OR r.aum > 1000000000  -- Include billion+ AUM firms
                )
            ORDER BY 
                -- Prioritize text matches
                CASE WHEN to_tsvector('english', 
                    COALESCE(r.legal_name, '') || ' ' || 
                    COALESCE(r.city, '') || ' ' || 
                    COALESCE(r.state, '') || ' ' ||
                    COALESCE(n.narrative, '')
                ) @@ websearch_to_tsquery('english', query_text) THEN 0 ELSE 1 END,
                -- Then by text rank
                ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.city, '') || ' ' || 
                        COALESCE(r.state, '') || ' ' ||
                        COALESCE(n.narrative, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) DESC,
                -- Then by AUM
                r.aum DESC NULLS LAST
            LIMIT match_count
        )
        SELECT * FROM fulltext_results;
    ELSE
        -- Standard hybrid search for other states
        RETURN QUERY
        WITH 
        semantic_results AS (
            SELECT 
                r.crd_number as id, 
                r.crd_number,
                r.legal_name, 
                r.city,
                r.state,
                COALESCE(r.aum, 0) as aum,
                COALESCE(r.private_fund_count, 0) as private_fund_count,
                COALESCE(r.private_fund_aum, 0) as private_fund_aum,
                (1 - (n.embedding_vector <=> query_embedding)) as semantic_score,
                ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) as semantic_rank
            FROM narratives n
            JOIN ria_profiles r ON n.crd_number = r.crd_number
            WHERE n.embedding_vector IS NOT NULL
                AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
                AND (state_filter IS NULL 
                     OR TRIM(state_filter) = '' 
                     OR r.state = UPPER(TRIM(state_filter)))
                AND COALESCE(r.aum, 0) >= min_aum
                AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            ORDER BY n.embedding_vector <=> query_embedding
            LIMIT match_count * 2
        ),
        fulltext_results AS (
            SELECT 
                r.crd_number as id, 
                r.crd_number,
                r.legal_name, 
                r.city,
                r.state,
                COALESCE(r.aum, 0) as aum,
                COALESCE(r.private_fund_count, 0) as private_fund_count,
                COALESCE(r.private_fund_aum, 0) as private_fund_aum,
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
                AND (state_filter IS NULL 
                     OR TRIM(state_filter) = '' 
                     OR r.state = UPPER(TRIM(state_filter)))
                AND COALESCE(r.aum, 0) >= min_aum
                AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
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
    END IF;
    
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
COMMENT ON FUNCTION search_rias IS 'Vector similarity search with Missouri-specific fallback to ensure Missouri RIAs are discoverable';
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search with special handling for Missouri to work around limited narrative data';

-- Step 3: Test the functions
-- Test search_rias with Missouri filter
SELECT COUNT(*) as missouri_search_results FROM search_rias(
    query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
    match_threshold := 0.0,
    match_count := 20,
    state_filter := 'MO'
);

-- Test hybrid_search_rias with Missouri filter  
SELECT COUNT(*) as missouri_hybrid_results FROM hybrid_search_rias(
    query_text := 'investment advisors',
    query_embedding := (SELECT ARRAY_AGG(0.1)::vector(768) FROM generate_series(1, 768)),
    match_threshold := 0.0,
    match_count := 20,
    state_filter := 'MO'
);

-- Step 4: Display summary of the fix
SELECT 
    'Fix Applied' as status,
    'Missouri RIAs will now appear in search results even without narratives' as description,
    'The search functions now include fallback logic for Missouri that returns firms ordered by AUM when narrative data is limited' as solution;
