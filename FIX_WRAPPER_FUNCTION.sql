-- Fix the wrapper function that the API actually calls

DROP FUNCTION IF EXISTS hybrid_search_rias_with_string_embedding CASCADE;

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
    
    -- Call our fixed hybrid_search_rias function
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
GRANT EXECUTE ON FUNCTION hybrid_search_rias_with_string_embedding TO authenticated, service_role, anon;

-- Test it
SELECT legal_name, city, state, aum
FROM hybrid_search_rias_with_string_embedding(
    'largest investment advisors',
    (SELECT embedding_vector::text FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
    0.3, 10, 'MO', 0, 0
);
