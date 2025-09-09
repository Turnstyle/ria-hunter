-- =====================================================
-- CRITICAL FIX: Apply location filters DURING search, not AFTER
-- =====================================================
-- Problem: State filter was applied after getting top results,
-- meaning location-specific queries would return nothing if 
-- the top semantic matches were from other locations
-- 
-- Author: Backend Team
-- Date: 2025-02-09
-- =====================================================

-- Drop and recreate the hybrid_search_rias function with proper filtering
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
    -- Set higher ef_search for better recall
    SET LOCAL hnsw.ef_search = 100;
    
    RETURN QUERY
    WITH 
    -- Semantic search WITH location filtering applied DURING search
    semantic_results AS (
        SELECT 
            n.crd_number,
            1 - (n.embedding_vector::vector(768) <=> query_embedding) as semantic_score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector::vector(768) <=> query_embedding) as semantic_rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND n.embedding_vector != ''
            AND 1 - (n.embedding_vector::vector(768) <=> query_embedding) > match_threshold
            -- CRITICAL FIX: Apply state filter HERE in semantic search
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector::vector(768) <=> query_embedding
        LIMIT match_count * 3
    ),
    -- Full-text search WITH location filtering applied DURING search
    fulltext_results AS (
        SELECT 
            r.crd_number,
            ts_rank_cd(
                to_tsvector('english', 
                    COALESCE(r.legal_name, '') || ' ' || 
                    COALESCE(r.city, '') || ' ' || 
                    COALESCE(r.state, '') || ' ' ||
                    COALESCE(r.business_description, '')
                ),
                websearch_to_tsquery('english', query_text),
                32
            ) as text_score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.city, '') || ' ' || 
                        COALESCE(r.state, '') || ' ' ||
                        COALESCE(r.business_description, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) DESC
            ) as text_rank
        FROM ria_profiles r
        WHERE to_tsvector('english', 
                COALESCE(r.legal_name, '') || ' ' || 
                COALESCE(r.city, '') || ' ' || 
                COALESCE(r.state, '') || ' ' ||
                COALESCE(r.business_description, '')
              ) @@ websearch_to_tsquery('english', query_text)
            -- CRITICAL FIX: Apply state filter HERE in text search
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
            -- RRF formula with weights
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
    WHERE 
        -- Fund type filter still applied here (complex condition)
        (
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
    ORDER BY cr.combined_score DESC
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'hybrid_search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Also fix search_rias function for consistency
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
            1 - (n.embedding_vector::vector(768) <=> query_embedding) as similarity_score
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND n.embedding_vector != ''
            AND 1 - (n.embedding_vector::vector(768) <=> query_embedding) > match_threshold
            -- CRITICAL: Apply filters DURING search
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector::vector(768) <=> query_embedding
        LIMIT match_count * 2  -- Get extra for fund type filtering
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
        sm.similarity_score
    FROM semantic_matches sm
    JOIN ria_profiles r ON sm.crd_number = r.crd_number
    WHERE 
        -- Fund type filter (complex condition)
        (
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
    ORDER BY sm.similarity_score DESC
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;

-- Add comments
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search with location filtering applied DURING search, not after';
COMMENT ON FUNCTION search_rias IS 'Semantic search with location filtering applied DURING search, not after';
