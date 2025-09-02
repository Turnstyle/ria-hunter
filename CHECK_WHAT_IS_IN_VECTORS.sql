-- Simple check to see what's actually in the vector columns
SELECT 
  crd_number,
  octet_length(embedding::text) as embedding_bytes,
  octet_length(embedding_vector::text) as embedding_vector_bytes,
  LEFT(embedding::text, 100) as embedding_first_100_chars,
  LEFT(embedding_vector::text, 100) as vector_first_100_chars
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL
LIMIT 5;

-- Check if the data looks like JSON strings (will be ~9500 bytes) or proper vectors (~6144 bytes)
SELECT 
  'Embedding Stats' as check_type,
  COUNT(*) as total_rows,
  COUNT(embedding) as has_embedding,
  COUNT(embedding_vector) as has_embedding_vector,
  AVG(octet_length(embedding::text)) as avg_embedding_bytes,
  AVG(octet_length(embedding_vector::text)) as avg_vector_bytes,
  MIN(octet_length(embedding::text)) as min_embedding_bytes,
  MAX(octet_length(embedding::text)) as max_embedding_bytes
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL;

-- Test if we can do vector operations (this will fail if they're JSON strings)
SELECT 
  crd_number,
  embedding <=> embedding as self_distance_test
FROM narratives
WHERE embedding IS NOT NULL
LIMIT 1;
