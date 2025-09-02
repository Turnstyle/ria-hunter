-- Check what we're actually dealing with
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'narratives' 
AND column_name IN ('embedding', 'embedding_vector')
ORDER BY column_name;

-- Check the actual data in both columns
SELECT 
  crd_number,
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as embedding_vector_type,
  CASE 
    WHEN embedding IS NOT NULL THEN 'HAS_DATA'
    ELSE 'NULL'
  END as embedding_status,
  CASE 
    WHEN embedding_vector IS NOT NULL THEN 'HAS_DATA'  
    ELSE 'NULL'
  END as embedding_vector_status
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL
LIMIT 10;

-- Check if the embeddings are already proper vectors
SELECT 
  crd_number,
  embedding <=> embedding as self_distance,
  'VECTOR_OPERATIONS_WORK' as test_result
FROM narratives
WHERE embedding IS NOT NULL
LIMIT 3;
