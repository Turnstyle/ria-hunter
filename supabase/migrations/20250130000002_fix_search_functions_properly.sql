-- Fix the search_rias and hybrid_search_rias functions properly
-- First, let's see what functions exist and drop them specifically

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop all variants of search_rias functions that might exist
DO $$
DECLARE 
    func_record RECORD;
BEGIN
    -- Find and drop all search_rias functions
    FOR func_record IN 
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args,
            n.nspname as schema_name
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE p.proname IN ('search_rias', 'hybrid_search_rias')
        AND n.nspname = 'public'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', 
            func_record.schema_name, 
            func_record.proname, 
            func_record.args);
        RAISE NOTICE 'Dropped function: %.%(%)', 
            func_record.schema_name, 
            func_record.proname, 
            func_record.args;
    END LOOP;
END $$;

-- Create search_rias function that matches API call signature
-- Uses narratives table for embeddings and joins with ria_profiles for filtering
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
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        match_count := LEAST(GREATEST(match_count, 1), 100);
    END IF;
    
    -- Main search query using cosine similarity on narratives, joined with ria_profiles
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
        -- CRITICAL: Proper state filtering - exact match only, no semantic matching
        AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
        -- AUM filter
        AND COALESCE(r.aum, 0) >= min_aum
        -- VC activity filter
        AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail completely
        RAISE WARNING 'search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Create hybrid_search_rias function that matches API call signature  
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
    
    RETURN QUERY
    WITH 
    -- Semantic search results - join narratives with ria_profiles
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
            -- CRITICAL: Proper state filtering - exact match only
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count * 2  -- Get more candidates for fusion
    ),
    -- Full-text search results
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
                32  -- Normalize rank
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
            -- CRITICAL: Proper state filtering - exact match only
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        LIMIT match_count * 2
    ),
    -- Combine results with Reciprocal Rank Fusion
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
            -- RRF formula: 1 / (k + rank)
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
        -- Log error but don't fail completely
        RAISE WARNING 'hybrid_search_rias error: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;

-- Add comments
COMMENT ON FUNCTION search_rias IS 'Vector similarity search for RIA profiles with exact state filtering (no semantic text matching on location)';
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search combining semantic and full-text search with exact state filtering';
