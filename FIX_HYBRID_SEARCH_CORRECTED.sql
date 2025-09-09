-- CORRECTED FIX: Cast state column to text to match function signature

DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;

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
BEGIN
    RETURN QUERY
    SELECT 
        r.crd_number as id,
        r.crd_number,
        r.legal_name::text,
        r.city::text,
        r.state::text,  -- Cast CHAR(2) to TEXT
        COALESCE(r.aum, 0) as aum,
        COALESCE(r.private_fund_count, 0) as private_fund_count,
        COALESCE(r.private_fund_aum, 0) as private_fund_aum,
        1 - (n.embedding_vector::vector(768) <=> query_embedding) as similarity,
        0.0::float as text_rank
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (state_filter IS NULL OR state_filter = '' OR r.state = state_filter)
        AND COALESCE(r.aum, 0) >= min_aum
        AND COALESCE(r.private_fund_count, 0) >= min_vc_activity
        AND 1 - (n.embedding_vector::vector(768) <=> query_embedding) > match_threshold
    ORDER BY n.embedding_vector::vector(768) <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role, anon;

-- Test it immediately
SELECT 
    legal_name,
    city,
    state,
    aum
FROM hybrid_search_rias(
    'largest investment advisors',
    (SELECT embedding_vector::vector(768) FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
    0.3, 10, 'MO', 0, 0
);
