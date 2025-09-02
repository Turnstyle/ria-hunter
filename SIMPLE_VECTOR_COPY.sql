-- ============================================================
-- SIMPLE VECTOR COPY - If embeddings are already vectors
-- ============================================================

-- Test if vector operations work on the embedding column
SELECT 
  crd_number,
  embedding <=> embedding as self_distance
FROM narratives
WHERE embedding IS NOT NULL
LIMIT 3;

-- If that works, then we just need to copy the data
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Check how many we updated
SELECT 
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_embedding_vector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NOT NULL) as both_populated
FROM narratives;

-- Update the match_narratives function to use embedding_vector
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  crd_number text,
  similarity float,
  legal_name text,
  narrative text
) 
LANGUAGE sql STABLE AS $$
  SELECT 
    n.crd_number::text,
    1 - (n.embedding_vector <=> query_embedding) as similarity,
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
$$;

-- Create HNSW index
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Test semantic search
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
BEGIN
  test_embedding := (SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768)))::vector(768);
  
  SELECT COUNT(*) INTO result_count
  FROM match_narratives(test_embedding, 0.0, 10);
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS WORKING! Found % matches', result_count;
  ELSE
    RAISE NOTICE '❌ Still no matches found';
  END IF;
END $$;
