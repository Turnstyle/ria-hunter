-- Check what actually happened with the vector copy
SELECT 
  'ACTUAL STATUS CHECK' as check_type,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_embedding_vector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NOT NULL) as both_have_data,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NULL) as need_copying
FROM narratives;

-- Check if the embeddings are actually the same
SELECT 
  crd_number,
  (embedding IS NOT NULL) as has_embedding,
  (embedding_vector IS NOT NULL) as has_embedding_vector,
  CASE 
    WHEN embedding IS NOT NULL AND embedding_vector IS NOT NULL THEN
      CASE WHEN embedding = embedding_vector THEN 'IDENTICAL' ELSE 'DIFFERENT' END
    ELSE 'MISSING_DATA'
  END as comparison
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL
LIMIT 10;

-- Check the byte size to see if they're actually vectors or still strings
SELECT 
  crd_number,
  octet_length(embedding::text) as embedding_bytes,
  octet_length(embedding_vector::text) as embedding_vector_bytes,
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as embedding_vector_type
FROM narratives
WHERE embedding IS NOT NULL
LIMIT 5;
