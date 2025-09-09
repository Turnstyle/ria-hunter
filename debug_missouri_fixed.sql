-- Fixed debug queries for Missouri RIAs

-- 1. Count Missouri RIAs (this worked - shows 1031)
SELECT COUNT(*) as missouri_rias_count 
FROM ria_profiles 
WHERE state = 'MO';

-- 2. Check if narratives exist for Missouri RIAs (FIXED)
SELECT COUNT(*) as missouri_with_embeddings
FROM narratives n
JOIN ria_profiles r ON n.crd_number = r.crd_number
WHERE r.state = 'MO' 
  AND n.embedding_vector IS NOT NULL
  AND LENGTH(n.embedding_vector) > 10;  -- Check it's not empty

-- 3. Get top Missouri RIAs and their embedding status (FIXED)
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    r.crd_number,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'No embedding'
        WHEN LENGTH(n.embedding_vector) < 10 THEN 'Empty embedding'
        ELSE 'Has embedding'
    END as embedding_status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO'
ORDER BY r.aum DESC NULLS LAST
LIMIT 10;

-- 4. Check specific big Missouri companies
SELECT 
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    CASE 
        WHEN n.embedding_vector IS NULL THEN 'No narrative/embedding'
        WHEN LENGTH(n.embedding_vector) < 10 THEN 'Empty embedding'
        ELSE 'Has embedding'
    END as status
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO'
  AND (r.legal_name LIKE '%EDWARD JONES%' 
       OR r.legal_name LIKE '%STIFEL%'
       OR r.aum > 1000000000)  -- Over $1B AUM
ORDER BY r.aum DESC NULLS LAST
LIMIT 20;

-- 5. Count how many Missouri RIAs have valid embeddings
SELECT 
    COUNT(*) as total_mo_rias,
    SUM(CASE WHEN n.embedding_vector IS NOT NULL AND LENGTH(n.embedding_vector) > 10 THEN 1 ELSE 0 END) as with_embeddings,
    SUM(CASE WHEN n.embedding_vector IS NULL OR LENGTH(n.embedding_vector) <= 10 THEN 1 ELSE 0 END) as without_embeddings
FROM ria_profiles r
LEFT JOIN narratives n ON r.crd_number = n.crd_number
WHERE r.state = 'MO';
