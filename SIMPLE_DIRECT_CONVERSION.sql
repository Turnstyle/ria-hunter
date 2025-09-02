-- ============================================================
-- SIMPLE DIRECT CONVERSION - Bypass the complex function
-- ============================================================

-- Let's try a much simpler approach
-- First, check if we can directly cast the JSON strings

-- Test with just one row to see what the actual issue is
SELECT 
  crd_number,
  embedding::text as json_string,
  LENGTH(embedding::text) as json_length,
  -- Try to convert just one
  CASE 
    WHEN embedding::text LIKE '[%]' THEN 'LOOKS_LIKE_JSON_ARRAY'
    ELSE 'NOT_JSON_ARRAY'
  END as format_check
FROM narratives
WHERE embedding IS NOT NULL
  AND (embedding_converted = FALSE OR embedding_converted IS NULL)
LIMIT 5;

-- Try converting just ONE row manually to see what happens
UPDATE narratives
SET embedding_vector = embedding::text::vector(768)
WHERE crd_number = '373'
  AND embedding IS NOT NULL;

-- Check if that worked
SELECT 
  crd_number,
  embedding_vector IS NOT NULL as has_vector,
  array_length(embedding_vector::float[], 1) as vector_dims
FROM narratives
WHERE crd_number = '373';
