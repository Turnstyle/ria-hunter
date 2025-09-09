-- Correct debug queries for Missouri RIAs with vector type

-- 1. Count Missouri RIAs (this worked - shows 1031)
SELECT COUNT(*) as missouri_rias_count 
FROM ria_profiles 
WHERE state = 'MO';

-- 2. Check if narratives exist for Missouri RIAs (CORRECT)
SELECT COUNT(*) as missouri_with_embeddings
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
WHERE r.state = 'MO' 
  AND n.embedding_vector IS NOT NULL;

-- 3. Get top Missouri RIAs and their embedding status
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    r.crd_number,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'No embedding'
        ELSE 'Has embedding'
    END as embedding_status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO'
ORDER BY r.aum DESC NULLS LAST
LIMIT 10;

-- 4. Check Edward Jones and Stifel specifically
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    n.crd_number as narrative_crd,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'NO EMBEDDING'
        ELSE 'HAS EMBEDDING'
    END as status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO'
  AND (r.legal_name LIKE '%EDWARD JONES%' 
       OR r.legal_name LIKE '%STIFEL%')
ORDER BY r.aum DESC NULLS LAST;

-- 5. Summary: How many Missouri RIAs have embeddings?
SELECT 
    COUNT(DISTINCT r.crd_number) as total_mo_rias,
    COUNT(DISTINCT CASE WHEN n.embedding_vector IS NOT NULL THEN r.crd_number END) as with_embeddings,
    COUNT(DISTINCT CASE WHEN n.embedding_vector IS NULL THEN r.crd_number END) as without_embeddings
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO';

-- 6. Test if the vector search works without state filter
WITH test_embedding AS (
    SELECT embedding_vector::vector(768) as test_vec
    FROM narratives 
    WHERE embedding_vector IS NOT NULL
    LIMIT 1
)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
CROSS JOIN test_embedding t
WHERE n.embedding_vector IS NOT NULL
ORDER BY n.embedding_vector::vector(768) <=> t.test_vec
LIMIT 5;

-- 7. Test if ANY Missouri RIAs appear in vector search
WITH test_embedding AS (
    SELECT embedding_vector::vector(768) as test_vec
    FROM narratives 
    WHERE embedding_vector IS NOT NULL
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
  AND r.state = 'MO'
ORDER BY n.embedding_vector::vector(768) <=> t.test_vec
LIMIT 10;
