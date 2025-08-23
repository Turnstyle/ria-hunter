-- Fix vector search functions with correct return types based on actual schema
-- Schema discovered:
-- narratives: id (string), crd_number (number), narrative (string), embedding_vector (string but contains vector data)
-- ria_profiles: crd_number (number, PK), legal_name (string), city (string), state (string), aum (number)

-- Create missing search_errors table first
CREATE TABLE IF NOT EXISTS search_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    query_params JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop old functions
DROP FUNCTION IF EXISTS match_narratives CASCADE;
DROP FUNCTION IF EXISTS search_rias CASCADE;  
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;
DROP FUNCTION IF EXISTS test_vector_search_performance CASCADE;
DROP FUNCTION IF EXISTS check_vector_search_performance CASCADE;

-- Fixed match_narratives function with correct return types
CREATE OR REPLACE FUNCTION match_narratives(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 15,
    narrative_type text DEFAULT NULL
)
RETURNS TABLE(
    id text,                    -- Changed from bigint to text (matches actual schema)
    narrative_text text,
    similarity_score float,
    crd_number bigint,          -- This matches the actual schema
    firm_name text              -- We'll alias legal_name as firm_name
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id::text,
        n.narrative as narrative_text,
        1 - (n.embedding_vector::vector(768) <=> query_embedding) as similarity_score,
        n.crd_number::bigint,
        r.legal_name as firm_name
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector::vector(768) <=> query_embedding)) > match_threshold
    ORDER BY n.embedding_vector::vector(768) <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Fixed search_rias function with correct schema
CREATE OR REPLACE FUNCTION search_rias(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.8,
    match_count integer DEFAULT 10,
    filter_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    crd_number bigint,          -- Using crd_number as primary identifier
    firm_name text,
    description text,           -- We'll use narrative as description
    similarity_score float,
    city text,
    state text,
    aum numeric,
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
BEGIN
    -- Extract filters from JSON
    state_filter := filter_criteria->>'state';
    city_filter := filter_criteria->>'city';
    min_aum_filter := (filter_criteria->>'min_aum')::NUMERIC;
    max_aum_filter := (filter_criteria->>'max_aum')::NUMERIC;
    
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'Query embedding cannot be null';
    END IF;
    
    IF match_count < 1 OR match_count > 100 THEN
        RAISE EXCEPTION 'Match count must be between 1 and 100';
    END IF;
    
    -- Main search query using cosine similarity with narratives
    RETURN QUERY
    SELECT 
        r.crd_number::bigint,
        r.legal_name as firm_name,
        n.narrative as description,
        1 - (n.embedding_vector::vector(768) <=> query_embedding) as similarity_score,
        r.city,
        r.state,
        r.aum,
        r.phone,
        r.website::text,
        jsonb_build_object(
            'form_adv_date', r.form_adv_date,
            'private_fund_count', r.private_fund_count,
            'private_fund_aum', r.private_fund_aum,
            'fax', r.fax
        ) as metadata
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        -- Similarity threshold
        AND (1 - (n.embedding_vector::vector(768) <=> query_embedding)) > match_threshold
        -- Apply optional filters
        AND (state_filter IS NULL OR r.state = state_filter)
        AND (city_filter IS NULL OR r.city ILIKE '%' || city_filter || '%')
        AND (min_aum_filter IS NULL OR r.aum >= min_aum_filter)
        AND (max_aum_filter IS NULL OR r.aum <= max_aum_filter)
    ORDER BY n.embedding_vector::vector(768) <=> query_embedding
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

-- Performance test function with correct return types
CREATE OR REPLACE FUNCTION test_vector_search_performance()
RETURNS TABLE(
    test_name TEXT,
    duration_ms NUMERIC,
    result_count INTEGER,
    status TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    duration_ms NUMERIC;
    result_count INTEGER;
    test_embedding vector(768);
BEGIN
    -- Create a test embedding (all 0.1 values for consistency)
    test_embedding := array_fill(0.1, ARRAY[768])::vector(768);
    
    -- Test 1: match_narratives performance
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM match_narratives(test_embedding, 0.5, 5);
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'narratives_vector_search'::TEXT,
        ROUND(duration_ms, 2),
        result_count,
        CASE 
            WHEN duration_ms < 10 THEN 'EXCELLENT'
            WHEN duration_ms < 50 THEN 'GOOD'
            WHEN duration_ms < 200 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END;
    
    -- Test 2: search_rias performance  
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM search_rias(test_embedding, 0.5, 10);
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'profiles_vector_search'::TEXT,
        ROUND(duration_ms, 2),
        result_count,
        CASE 
            WHEN duration_ms < 10 THEN 'EXCELLENT'
            WHEN duration_ms < 50 THEN 'GOOD'
            WHEN duration_ms < 200 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END;
        
    -- Test 3: Direct vector query performance
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM narratives 
    WHERE embedding_vector IS NOT NULL
        AND (1 - (embedding_vector::vector(768) <=> test_embedding)) > 0.5
    LIMIT 10;
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'direct_vector_query'::TEXT,
        ROUND(duration_ms, 2),
        result_count,
        CASE 
            WHEN duration_ms < 5 THEN 'EXCELLENT'
            WHEN duration_ms < 20 THEN 'GOOD'  
            WHEN duration_ms < 100 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION test_vector_search_performance TO authenticated, service_role, anon;

-- Create index usage monitoring function
CREATE OR REPLACE FUNCTION check_vector_indexes()
RETURNS TABLE(
    table_name TEXT,
    index_name TEXT,
    index_type TEXT,
    column_name TEXT,
    size_mb NUMERIC
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
        END as column_name,
        ROUND((pg_relation_size(t.indexname::regclass) / 1024.0 / 1024.0)::numeric, 2) as size_mb
    FROM pg_indexes t
    WHERE t.schemaname = 'public' 
        AND (t.indexdef LIKE '%embedding%' OR t.indexdef LIKE '%vector%')
    ORDER BY t.tablename, t.indexname;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION match_narratives IS 'Vector similarity search for narrative content - corrected return types';
COMMENT ON FUNCTION search_rias IS 'Main vector search function for RIA profiles with filtering - corrected schema';
COMMENT ON FUNCTION test_vector_search_performance IS 'Performance monitoring for vector search functions';
COMMENT ON FUNCTION check_vector_indexes IS 'Check status and size of vector indexes';

-- Create a helper function for ETL pipeline (Phase 2)
CREATE OR REPLACE FUNCTION get_missing_narratives()
RETURNS TABLE(
    crd_number bigint,
    legal_name text,
    city text,
    state text,
    has_narrative boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.crd_number::bigint,
        r.legal_name,
        r.city,
        r.state,
        (n.crd_number IS NOT NULL) as has_narrative
    FROM ria_profiles r
    LEFT JOIN narratives n ON r.crd_number = n.crd_number
    WHERE n.crd_number IS NULL  -- Missing narratives
    ORDER BY r.crd_number
    LIMIT 100;  -- Limit for testing
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_missing_narratives IS 'Identify RIA profiles without narratives for ETL processing';
