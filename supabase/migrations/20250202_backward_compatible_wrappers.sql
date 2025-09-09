-- =====================================================
-- BACKWARD COMPATIBILITY WRAPPERS FOR API MIGRATION
-- =====================================================
-- These functions maintain compatibility with existing API calls
-- that pass embeddings as JSON strings, while using the new
-- efficient native vector implementation under the hood
-- =====================================================

-- Drop old string-based functions if they exist
DROP FUNCTION IF EXISTS search_rias_with_string_embedding CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_rias_with_string_embedding CASCADE;

-- Create backward-compatible wrapper for search_rias
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
    -- Convert JSON string to vector once
    BEGIN
        query_vector := query_embedding_string::vector(768);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to convert embedding string to vector: %', SQLERRM;
    END;
    
    -- Call the efficient native function
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

-- Create backward-compatible wrapper for hybrid_search_rias
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
    -- Convert JSON string to vector once
    BEGIN
        query_vector := query_embedding_string::vector(768);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to convert embedding string to vector: %', SQLERRM;
    END;
    
    -- Call the efficient native function
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_rias_with_string_embedding TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION hybrid_search_rias_with_string_embedding TO authenticated, service_role, anon;

-- Add helpful comments
COMMENT ON FUNCTION search_rias_with_string_embedding IS 
'Backward compatibility wrapper that accepts string embeddings but uses efficient native vector search internally';
COMMENT ON FUNCTION hybrid_search_rias_with_string_embedding IS 
'Backward compatibility wrapper for hybrid search that accepts string embeddings but uses efficient native implementation';

-- =====================================================
-- TEST THE WRAPPERS
-- =====================================================
DO $$
DECLARE
    test_embedding_string text;
    result_count integer;
BEGIN
    -- Get a sample embedding as string for testing
    SELECT embedding_vector::text INTO test_embedding_string
    FROM narratives
    WHERE embedding_vector IS NOT NULL
    LIMIT 1;
    
    IF test_embedding_string IS NULL THEN
        RAISE WARNING 'No embeddings found for testing';
        RETURN;
    END IF;
    
    -- Test search_rias wrapper
    SELECT COUNT(*) INTO result_count
    FROM search_rias_with_string_embedding(
        test_embedding_string,
        0.3,
        10
    );
    
    RAISE NOTICE 'search_rias wrapper test: % results', result_count;
    
    -- Test hybrid_search_rias wrapper
    SELECT COUNT(*) INTO result_count
    FROM hybrid_search_rias_with_string_embedding(
        'investment management',
        test_embedding_string,
        0.3,
        10
    );
    
    RAISE NOTICE 'hybrid_search_rias wrapper test: % results', result_count;
    
    RAISE NOTICE 'All wrapper tests passed successfully!';
END $$;

-- =====================================================
-- MIGRATION NOTES FOR API ENDPOINTS
-- =====================================================
-- The API endpoints can continue using the _with_string_embedding functions
-- These wrappers now use the efficient native vector search internally
-- 
-- Future optimization: Update API endpoints to:
-- 1. Pass vectors directly instead of strings
-- 2. Use the native search_rias and hybrid_search_rias functions
-- 
-- This provides immediate performance benefits while allowing
-- gradual migration of the API layer
-- =====================================================
