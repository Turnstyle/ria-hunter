-- Create proper vector search functions based on Final_Refactor_Backend_Plan_v2_22-Aug-2025.md
-- These functions use the embedding_vector column (768 dimensions) instead of the old embedding column

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS match_narratives;
DROP FUNCTION IF EXISTS match_documents;
DROP FUNCTION IF EXISTS search_rias;
DROP FUNCTION IF EXISTS hybrid_search_rias;

-- Core vector search function for RIA profiles (from plan section 1.3)
CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.8,
    match_count integer DEFAULT 10,
    filter_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    id bigint,
    firm_name text,
    description text,
    similarity_score float,
    city text,
    state text,
    aum_range text,
    crd_number text,
    phone text,
    website text,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    state_filter TEXT;
    city_filter TEXT;
    min_aum_filter NUMERIC;
    max_aum_filter NUMERIC;
    services_filter TEXT[];
BEGIN
    -- Extract filters from JSON
    state_filter := filter_criteria->>'state';
    city_filter := filter_criteria->>'city';
    min_aum_filter := (filter_criteria->>'min_aum')::NUMERIC;
    max_aum_filter := (filter_criteria->>'max_aum')::NUMERIC;
    services_filter := ARRAY(SELECT jsonb_array_elements_text(filter_criteria->'services'));
    
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        RAISE EXCEPTION 'Match count must be between 1 and 100';
    END IF;
    
    -- Main search query using cosine similarity
    RETURN QUERY
    SELECT 
        r.id::bigint,
        r.legal_name as firm_name,
        r.business_description as description,
        1 - (r.embedding_768 <=> query_embedding) as similarity_score,
        r.city,
        r.state,
        r.aum_range,
        r.crd_number,
        r.phone,
        r.website,
        jsonb_build_object(
            'employee_count', r.employee_count,
            'year_founded', r.year_founded,
            'services', r.services,
            'client_types', r.client_types,
            'last_updated', r.updated_at
        ) as metadata
    FROM ria_profiles r
    WHERE r.embedding_768 IS NOT NULL
        -- Similarity threshold
        AND (1 - (r.embedding_768 <=> query_embedding)) > match_threshold
        -- Apply optional filters
        AND (state_filter IS NULL OR r.state = state_filter)
        AND (city_filter IS NULL OR r.city ILIKE '%' || city_filter || '%')
        AND (min_aum_filter IS NULL OR r.aum >= min_aum_filter)
        AND (max_aum_filter IS NULL OR r.aum <= max_aum_filter)
        AND (services_filter IS NULL OR r.services && services_filter)
    ORDER BY r.embedding_768 <=> query_embedding
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return empty result
        INSERT INTO search_errors (function_name, error_message, query_params)
        VALUES (
            'search_rias',
            SQLERRM,
            jsonb_build_object(
                'threshold', match_threshold,
                'count', match_count,
                'filters', filter_criteria
            )
        );
        RETURN;
END;
$$;

-- Narrative matching function (from plan section 1.3)
CREATE OR REPLACE FUNCTION match_narratives(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 15,
    narrative_type text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    narrative_text text,
    similarity_score float,
    ria_id bigint,
    firm_name text,
    narrative_metadata jsonb
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.narrative as narrative_text,
        1 - (n.embedding_vector <=> query_embedding) as similarity_score,
        n.crd_number as ria_id,
        r.legal_name as firm_name,
        jsonb_build_object(
            'narrative_type', 'generated',
            'generated_at', n.updated_at,
            'model', 'text-embedding-3-small',
            'city', r.city,
            'state', r.state,
            'aum', r.aum
        ) as narrative_metadata
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Hybrid search with Reciprocal Rank Fusion (from plan section 1.3)
CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_count integer DEFAULT 10,
    semantic_weight float DEFAULT 0.7,
    full_text_weight float DEFAULT 0.3,
    filter_criteria jsonb DEFAULT '{}'::jsonb,
    use_cross_encoder boolean DEFAULT false
)
RETURNS TABLE(
    id bigint,
    firm_name text,
    description text,
    combined_score float,
    semantic_score float,
    fulltext_score float,
    debug_info jsonb
)
LANGUAGE plpgsql AS $$
DECLARE
    k_value INTEGER := 60; -- RRF constant
BEGIN
    -- Input validation
    IF query_text IS NULL OR trim(query_text) = '' THEN
        RAISE EXCEPTION 'Query text cannot be empty';
    END IF;
    
    IF semantic_weight + full_text_weight != 1.0 THEN
        semantic_weight := semantic_weight / (semantic_weight + full_text_weight);
        full_text_weight := full_text_weight / (semantic_weight + full_text_weight);
    END IF;
    
    RETURN QUERY
    WITH 
    -- Semantic search results
    semantic_results AS (
        SELECT 
            r.id, 
            r.legal_name as firm_name, 
            r.business_description as description,
            1 - (r.embedding_768 <=> query_embedding) as score,
            ROW_NUMBER() OVER (ORDER BY r.embedding_768 <=> query_embedding) as rank
        FROM ria_profiles r
        WHERE r.embedding_768 IS NOT NULL
            AND (filter_criteria->>'state' IS NULL OR r.state = filter_criteria->>'state')
            AND (filter_criteria->>'city' IS NULL OR r.city ILIKE '%' || filter_criteria->>'city' || '%')
        ORDER BY r.embedding_768 <=> query_embedding
        LIMIT match_count * 3  -- Get more candidates for fusion
    ),
    -- Full-text search results
    fulltext_results AS (
        SELECT 
            r.id, 
            r.legal_name as firm_name, 
            r.business_description as description,
            ts_rank_cd(
                to_tsvector('english', 
                    COALESCE(r.legal_name, '') || ' ' || 
                    COALESCE(r.business_description, '') || ' ' || 
                    COALESCE(r.city, '') || ' ' || 
                    COALESCE(r.state, '') || ' ' ||
                    COALESCE(array_to_string(r.services, ' '), '')
                ),
                websearch_to_tsquery('english', query_text),
                32  -- Normalize rank
            ) as score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', 
                        COALESCE(r.legal_name, '') || ' ' || 
                        COALESCE(r.business_description, '')
                    ),
                    websearch_to_tsquery('english', query_text),
                    32
                ) DESC
            ) as rank
        FROM ria_profiles r
        WHERE to_tsvector('english', 
                COALESCE(r.legal_name, '') || ' ' || 
                COALESCE(r.business_description, '') || ' ' ||
                COALESCE(array_to_string(r.services, ' '), '')
              ) @@ websearch_to_tsquery('english', query_text)
            AND (filter_criteria->>'state' IS NULL OR r.state = filter_criteria->>'state')
            AND (filter_criteria->>'city' IS NULL OR r.city ILIKE '%' || filter_criteria->>'city' || '%')
        LIMIT match_count * 3
    ),
    -- Reciprocal Rank Fusion
    rrf_scores AS (
        SELECT 
            COALESCE(s.id, f.id) as id,
            COALESCE(s.firm_name, f.firm_name) as firm_name,
            COALESCE(s.description, f.description) as description,
            -- RRF formula: 1 / (k + rank)
            COALESCE(semantic_weight / (k_value + s.rank), 0) +
            COALESCE(full_text_weight / (k_value + f.rank), 0) as rrf_score,
            s.score as semantic_score,
            f.score as fulltext_score,
            s.rank as semantic_rank,
            f.rank as fulltext_rank
        FROM semantic_results s
        FULL OUTER JOIN fulltext_results f ON s.id = f.id
    )
    SELECT 
        rrf.id,
        rrf.firm_name,
        rrf.description,
        rrf.rrf_score as combined_score,
        rrf.semantic_score,
        rrf.fulltext_score,
        jsonb_build_object(
            'semantic_rank', rrf.semantic_rank,
            'fulltext_rank', rrf.fulltext_rank,
            'rrf_score', rrf.rrf_score,
            'weights', jsonb_build_object(
                'semantic', semantic_weight,
                'fulltext', full_text_weight
            ),
            'cross_encoder_used', use_cross_encoder
        ) as debug_info
    FROM rrf_scores rrf
    WHERE rrf.rrf_score > 0
    ORDER BY rrf.rrf_score DESC
    LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;

-- Create performance monitoring function
CREATE OR REPLACE FUNCTION check_vector_search_performance()
RETURNS TABLE(
    function_name TEXT,
    avg_duration_ms NUMERIC,
    test_status TEXT,
    index_usage TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    duration_ms NUMERIC;
    test_embedding vector(768);
    result_count INTEGER;
BEGIN
    -- Create a test embedding (all 0.1 values)
    test_embedding := array_fill(0.1, ARRAY[768])::vector(768);
    
    -- Test match_narratives performance
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM match_narratives(test_embedding, 0.5, 5);
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'match_narratives'::TEXT,
        ROUND(duration_ms, 2),
        CASE 
            WHEN duration_ms < 10 THEN 'EXCELLENT'
            WHEN duration_ms < 50 THEN 'GOOD'
            WHEN duration_ms < 200 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END,
        CASE 
            WHEN result_count > 0 THEN 'WORKING'
            ELSE 'NO_RESULTS'
        END;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to test if HNSW index exists
CREATE OR REPLACE FUNCTION check_vector_indexes()
RETURNS TABLE(
    table_name TEXT,
    index_name TEXT,
    index_type TEXT,
    column_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.schemaname::TEXT || '.' || t.tablename::TEXT as table_name,
        t.indexname::TEXT,
        CASE 
            WHEN t.indexdef LIKE '%USING hnsw%' THEN 'HNSW'
            WHEN t.indexdef LIKE '%USING ivfflat%' THEN 'IVFFlat'
            WHEN t.indexdef LIKE '%USING btree%' THEN 'B-tree'
            WHEN t.indexdef LIKE '%USING gin%' THEN 'GIN'
            ELSE 'Other'
        END as index_type,
        CASE 
            WHEN t.indexdef LIKE '%embedding_vector%' THEN 'embedding_vector'
            WHEN t.indexdef LIKE '%embedding_768%' THEN 'embedding_768'  
            WHEN t.indexdef LIKE '%embedding%' THEN 'embedding'
            ELSE 'other'
        END as column_name
    FROM pg_indexes t
    WHERE t.schemaname = 'public' 
        AND (t.indexdef LIKE '%embedding%' OR t.indexdef LIKE '%vector%')
    ORDER BY t.tablename, t.indexname;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION search_rias IS 'Main vector search function for RIA profiles with filtering and performance optimization';
COMMENT ON FUNCTION match_narratives IS 'Vector similarity search for narrative content';
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search combining semantic and full-text search with Reciprocal Rank Fusion';
COMMENT ON FUNCTION check_vector_search_performance IS 'Performance monitoring for vector search functions';
COMMENT ON FUNCTION check_vector_indexes IS 'Check status of vector indexes';
