-- Test the hybrid_search_rias function directly

-- 1. Get a test embedding from a Missouri RIA (Edward Jones)
WITH missouri_embedding AS (
    SELECT n.embedding_vector::vector(768) as test_vec
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE r.legal_name LIKE '%EDWARD JONES%'
      AND r.state = 'MO'
      AND n.embedding_vector IS NOT NULL
    LIMIT 1
)
SELECT * FROM hybrid_search_rias(
    'largest investment advisors',  -- query_text
    (SELECT test_vec FROM missouri_embedding),  -- use Edward Jones embedding
    0.3,  -- threshold
    10,   -- count
    'MO', -- state filter
    0,    -- min_vc
    0,    -- min_aum
    NULL  -- fund_type_filter
);

-- 2. If that doesn't work, test search_rias directly
WITH missouri_embedding AS (
    SELECT n.embedding_vector::vector(768) as test_vec
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE r.legal_name LIKE '%EDWARD JONES%'
      AND r.state = 'MO'
      AND n.embedding_vector IS NOT NULL
    LIMIT 1
)
SELECT * FROM search_rias(
    (SELECT test_vec FROM missouri_embedding),  -- use Edward Jones embedding
    0.3,  -- threshold
    10,   -- count
    'MO', -- state filter
    0,    -- min_vc
    0,    -- min_aum
    NULL  -- fund_type_filter
);

-- 3. Test if the semantic search part works WITHOUT the function
WITH missouri_embedding AS (
    SELECT n.embedding_vector::vector(768) as test_vec
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE r.legal_name LIKE '%EDWARD JONES%'
      AND r.state = 'MO'
      AND n.embedding_vector IS NOT NULL
    LIMIT 1
)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    1 - (n.embedding_vector::vector(768) <=> me.test_vec) as similarity
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
CROSS JOIN missouri_embedding me
WHERE n.embedding_vector IS NOT NULL
    AND r.state = 'MO'  -- Filter for Missouri
    AND 1 - (n.embedding_vector::vector(768) <=> me.test_vec) > 0.3
ORDER BY n.embedding_vector::vector(768) <=> me.test_vec
LIMIT 10;

-- 4. Check if text search works for Missouri
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    ts_rank_cd(
        to_tsvector('english', 
            COALESCE(r.legal_name, '') || ' ' || 
            COALESCE(r.city, '') || ' ' || 
            COALESCE(r.state, '')
        ),
        websearch_to_tsquery('english', 'largest investment advisors'),
        32
    ) as text_score
FROM ria_profiles r
WHERE r.state = 'MO'
    AND to_tsvector('english', 
            COALESCE(r.legal_name, '') || ' ' || 
            COALESCE(r.city, '') || ' ' || 
            COALESCE(r.state, '')
        ) @@ websearch_to_tsquery('english', 'largest investment advisors')
ORDER BY text_score DESC
LIMIT 10;
