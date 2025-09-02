-- Check what's actually stored in the embedding columns
SELECT 
  crd_number,
  -- Check embedding column
  CASE 
    WHEN embedding IS NULL THEN 'NULL'
    WHEN octet_length(embedding::text) > 1000 THEN 'LOOKS_LIKE_JSON_STRING (' || octet_length(embedding::text) || ' bytes)'
    WHEN array_length(embedding::float[], 1) = 768 THEN 'VALID_VECTOR_768'
    ELSE 'UNKNOWN (' || octet_length(embedding::text) || ' bytes)'
  END as embedding_status,
  -- Check embedding_vector column  
  CASE 
    WHEN embedding_vector IS NULL THEN 'NULL'
    WHEN octet_length(embedding_vector::text) > 1000 THEN 'LOOKS_LIKE_JSON_STRING (' || octet_length(embedding_vector::text) || ' bytes)'
    WHEN array_length(embedding_vector::float[], 1) = 768 THEN 'VALID_VECTOR_768'
    ELSE 'UNKNOWN (' || octet_length(embedding_vector::text) || ' bytes)'
  END as embedding_vector_status,
  -- Sample first few chars
  LEFT(embedding::text, 50) as embedding_sample,
  LEFT(embedding_vector::text, 50) as embedding_vector_sample
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL
LIMIT 10;

-- Try to check if they're valid vectors
SELECT 
  COUNT(*) as total,
  COUNT(embedding) as has_embedding,
  COUNT(embedding_vector) as has_embedding_vector,
  COUNT(*) FILTER (WHERE array_length(embedding::float[], 1) = 768) as valid_embedding_768,
  COUNT(*) FILTER (WHERE array_length(embedding_vector::float[], 1) = 768) as valid_embedding_vector_768
FROM narratives;
