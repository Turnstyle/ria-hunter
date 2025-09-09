-- Debug why no Missouri results are being returned

-- 1. First, verify Missouri RIAs exist
SELECT COUNT(*) as missouri_rias_count 
FROM ria_profiles 
WHERE state = 'MO';

-- 2. Check if narratives exist for Missouri RIAs
SELECT COUNT(*) as missouri_with_embeddings
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
WHERE r.state = 'MO' 
  AND n.embedding_vector IS NOT NULL
  AND n.embedding_vector != '';

-- 3. Get sample Missouri RIAs with embeddings
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'No embedding'
        WHEN n.embedding_vector = '' THEN 'Empty embedding'
        ELSE 'Has embedding'
    END as embedding_status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO'
ORDER BY r.aum DESC NULLS LAST
LIMIT 10;

-- 4. Test semantic search without state filter to see what we get
WITH test_embedding AS (
    SELECT embedding_vector::vector(768) as test_vec
    FROM narratives 
    WHERE embedding_vector IS NOT NULL 
      AND embedding_vector != ''
    LIMIT 1
)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    1 - (n.embedding_vector::vector(768) <=> t.test_vec) as similarity
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
CROSS JOIN test_embedding t
WHERE n.embedding_vector IS NOT NULL
  AND n.embedding_vector != ''
ORDER BY n.embedding_vector::vector(768) <=> t.test_vec
LIMIT 10;

-- 5. Now test with Missouri filter
WITH test_embedding AS (
    SELECT embedding_vector::vector(768) as test_vec
    FROM narratives 
    WHERE embedding_vector IS NOT NULL 
      AND embedding_vector != ''
    LIMIT 1
)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    1 - (n.embedding_vector::vector(768) <=> t.test_vec) as similarity
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
CROSS JOIN test_embedding t
WHERE n.embedding_vector IS NOT NULL
  AND n.embedding_vector != ''
  AND r.state = 'MO'  -- Missouri filter
ORDER BY n.embedding_vector::vector(768) <=> t.test_vec
LIMIT 10;

-- 6. Check if Edward Jones has embeddings (we know it's in MO)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    n.crd_number,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'No embedding'
        WHEN n.embedding_vector = '' THEN 'Empty embedding'
        ELSE 'Has embedding'
    END as embedding_status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.legal_name LIKE '%EDWARD JONES%'
  AND r.state = 'MO'
LIMIT 5;
