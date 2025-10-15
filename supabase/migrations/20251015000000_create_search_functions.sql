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

