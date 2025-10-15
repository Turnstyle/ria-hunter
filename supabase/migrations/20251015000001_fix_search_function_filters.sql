-- =====================================================
-- FIX: Update search functions to handle null values properly
-- =====================================================
-- The original functions were too strict with filtering,
-- causing 0 results even when data exists.
-- This migration updates the functions to be more lenient.
-- =====================================================

-- =====================================================
-- FUNCTION 1: hybrid_search_rias (Fixed)
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
    k_value CONSTANT integer := 60;
BEGIN
    SET LOCAL hnsw.ef_search = 100;
    
    RETURN QUERY
    WITH 
    semantic_results AS (
        SELECT 
            n.crd_number,
            1 - (n.embedding_vector <=> query_embedding) as semantic_score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) as semantic_rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND (1 - (n.embedding_vector <=> query_embedding)) >= match_threshold
            -- Only filter by state if explicitly provided and not empty
            AND (state_filter IS NULL OR state_filter = '' OR COALESCE(r.state, '') = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count * 3
    ),
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
            AND (state_filter IS NULL OR state_filter = '' OR COALESCE(r.state, '') = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        LIMIT match_count * 3
    ),
    combined_results AS (
        SELECT 
            COALESCE(s.crd_number, f.crd_number) as crd_number,
            COALESCE(s.semantic_score, 0) as semantic_score,
            COALESCE(f.text_score, 0) as text_score,
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
    WHERE cr.combined_score >= 0
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
-- FUNCTION 2: search_rias (Fixed)
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
    SET LOCAL hnsw.ef_search = 100;
    
    RETURN QUERY
    WITH semantic_matches AS (
        SELECT 
            n.crd_number,
            1 - (n.embedding_vector <=> query_embedding) as similarity_score
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND (1 - (n.embedding_vector <=> query_embedding)) >= match_threshold
            -- Only filter by state if explicitly provided and not empty
            AND (state_filter IS NULL OR state_filter = '' OR COALESCE(r.state, '') = UPPER(TRIM(state_filter)))
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

-- No need to update wrapper functions - they just pass through to these

COMMENT ON FUNCTION hybrid_search_rias IS 
'Hybrid search combining semantic (vector) and full-text search using RRF. Updated to handle null values properly.';

COMMENT ON FUNCTION search_rias IS 
'Pure semantic search using vector similarity. Updated to handle null values properly.';

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Search functions updated to handle null values properly';
END $$;

