-- Check the actual column structure
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'narratives' 
AND column_name IN ('embedding', 'embedding_vector')
ORDER BY column_name;

-- Check data types in the table
SELECT 
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as embedding_vector_type,
  COUNT(*) as count
FROM narratives
GROUP BY pg_typeof(embedding), pg_typeof(embedding_vector);

-- Check if embeddings are strings or vectors
SELECT 
  crd_number,
  CASE 
    WHEN pg_typeof(embedding)::text = 'text' THEN 'TEXT'
    WHEN pg_typeof(embedding)::text = 'vector' THEN 'VECTOR'
    ELSE pg_typeof(embedding)::text
  END as embedding_type,
  CASE 
    WHEN embedding IS NULL THEN 'NULL'
    WHEN pg_typeof(embedding)::text = 'text' THEN LEFT(embedding::text, 50)
    ELSE 'HAS_DATA'
  END as embedding_sample
FROM narratives
WHERE embedding IS NOT NULL
LIMIT 5;

-- Check the current match_narratives function signature
SELECT 
  proname as function_name,
  proargnames as argument_names,
  proargtypes::regtype[] as argument_types
FROM pg_proc
WHERE proname = 'match_narratives';
