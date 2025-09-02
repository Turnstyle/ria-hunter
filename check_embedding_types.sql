-- Check what data types we're actually dealing with
SELECT 
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as vector_type,
  COUNT(*) as count
FROM narratives
GROUP BY pg_typeof(embedding), pg_typeof(embedding_vector);

-- Check a sample of the data
SELECT 
  id,
  crd_number,
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as vector_type,
  CASE 
    WHEN embedding IS NULL THEN 'NULL'
    WHEN pg_typeof(embedding)::text = 'text' THEN LEFT(embedding::text, 50) || '...'
    WHEN pg_typeof(embedding)::text = 'vector' THEN 'VECTOR(' || array_length(embedding::float[]::float[], 1)::text || ')'
    ELSE pg_typeof(embedding)::text
  END as embedding_preview
FROM narratives
LIMIT 10;
