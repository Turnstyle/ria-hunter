-- Fix RPC functions to handle embeddings stored as JSON strings
-- This creates wrapper functions that convert string embeddings to vectors

-- Drop old versions if they exist
DROP FUNCTION IF EXISTS search_rias_with_string_embedding(text, float, integer, text, numeric, numeric);
DROP FUNCTION IF EXISTS hybrid_search_rias_with_string_embedding(text, text, float, integer, text, numeric, numeric);

-- Create search_rias wrapper that accepts string embedding
CREATE OR REPLACE FUNCTION search_rias_with_string_embedding(
    query_embedding_string text,  -- JSON string array of 768 floats
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
    
    -- Main search query using cosine similarity on narratives, joined with ria_profiles
    -- Note: embedding_vector in narratives table is also stored as string, so we convert it too
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
        (1 - (n.embedding_vector::vector(768) <=> query_vector)) as similarity
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND n.embedding_vector != ''
        -- Similarity threshold
        AND (1 - (n.embedding_vector::vector(768) <=> query_vector)) > match_threshold
        -- State filtering - exact match only
        AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
        -- AUM filter
        AND COALESCE(r.aum, 0) >= min_aum
        -- VC activity filter
        AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
    ORDER BY n.embedding_vector::vector(768) <=> query_vector
    LIMIT match_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'search_rias_with_string_embedding error: %', SQLERRM;
        RETURN;
END;
$$;

-- Create hybrid_search_rias wrapper that accepts string embedding
CREATE OR REPLACE FUNCTION hybrid_search_rias_with_string_embedding(
    query_text text,
    query_embedding_string text,  -- JSON string array of 768 floats
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
    query_vector vector(768);
    k_value CONSTANT integer := 60;
BEGIN
    -- Convert JSON string to vector
    BEGIN
        query_vector := query_embedding_string::vector(768);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to convert embedding string to vector: %', SQLERRM;
    END;
    
    -- Use CTE for semantic and text search, then combine
    RETURN QUERY
    WITH semantic_results AS (
        SELECT 
            r.crd_number as id,
            r.crd_number,
            r.legal_name,
            r.city,
            r.state,
            COALESCE(r.aum, 0) as aum,
            COALESCE(r.private_fund_count, 0) as private_fund_count,
            COALESCE(r.private_fund_aum, 0) as private_fund_aum,
            (1 - (n.embedding_vector::vector(768) <=> query_vector)) as semantic_score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector::vector(768) <=> query_vector) as semantic_rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND n.embedding_vector != ''
            AND (1 - (n.embedding_vector::vector(768) <=> query_vector)) > match_threshold
            AND (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        ORDER BY n.embedding_vector::vector(768) <=> query_vector
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
            ts_rank(
                to_tsvector('english', COALESCE(r.legal_name, '') || ' ' || 
                           COALESCE(r.city, '') || ' ' || 
                           COALESCE(r.state, '')),
                plainto_tsquery('english', query_text)
            ) as text_score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank(
                    to_tsvector('english', COALESCE(r.legal_name, '') || ' ' || 
                               COALESCE(r.city, '') || ' ' || 
                               COALESCE(r.state, '')),
                    plainto_tsquery('english', query_text)
                ) DESC
            ) as text_rank
        FROM ria_profiles r
        WHERE (state_filter IS NULL OR state_filter = '' OR r.state = UPPER(TRIM(state_filter)))
            AND COALESCE(r.aum, 0) >= min_aum
            AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
            AND (
                query_text IS NULL 
                OR query_text = ''
                OR to_tsvector('english', COALESCE(r.legal_name, '') || ' ' || 
                              COALESCE(r.city, '') || ' ' || 
                              COALESCE(r.state, '')) @@ plainto_tsquery('english', query_text)
            )
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
        RAISE WARNING 'hybrid_search_rias_with_string_embedding error: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_rias_with_string_embedding TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias_with_string_embedding TO authenticated, service_role, anon;

-- Add comments
COMMENT ON FUNCTION search_rias_with_string_embedding IS 'Vector similarity search that accepts string embeddings and converts them';
COMMENT ON FUNCTION hybrid_search_rias_with_string_embedding IS 'Hybrid search that accepts string embeddings and converts them';

-- Test the new function
SELECT COUNT(*) as test_count FROM hybrid_search_rias_with_string_embedding(
    'St. Louis Missouri RIAs',
    (SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
    0.1,
    10,
    'MO',
    0,
    0
);
