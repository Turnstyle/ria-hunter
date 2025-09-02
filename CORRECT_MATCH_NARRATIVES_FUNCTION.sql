-- ============================================================
-- CORRECT MATCH_NARRATIVES FUNCTION
-- Based on actual table structure
-- ============================================================

-- 1. Copy vectors (if not done already)
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- 2. Drop existing function completely
DROP FUNCTION IF EXISTS match_narratives(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);
DROP FUNCTION IF EXISTS match_narratives;

-- 3. Create correct function that joins with ria_profiles for legal_name
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
    COALESCE(r.legal_name, 'Unknown') as legal_name,
    n.narrative
  FROM narratives n
  LEFT JOIN ria_profiles r ON n.crd_number = r.crd_number
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
$$;

-- 4. Create HNSW index
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- 5. Analyze table
ANALYZE narratives;

-- 6. Test the function
DO $$
DECLARE
  test_count INT;
  test_similarity FLOAT;
  test_name TEXT;
BEGIN
  -- Create test embedding
  DECLARE test_embedding vector(768) := (
    SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768))
  )::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity), 
         (SELECT legal_name FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1)
  INTO test_count, test_similarity, test_name
  FROM match_narratives(test_embedding, 0.0, 5);
  
  RAISE NOTICE '================================================';
  RAISE NOTICE '🧪 SEMANTIC SEARCH TEST RESULTS:';
  RAISE NOTICE '  Matches found: %', test_count;
  RAISE NOTICE '  Max similarity: %', ROUND(test_similarity::numeric, 3);
  RAISE NOTICE '  Sample firm: %', COALESCE(test_name, 'No results');
  
  IF test_count > 0 AND test_similarity > 0 THEN
    RAISE NOTICE '✅ SUCCESS! SEMANTIC SEARCH IS WORKING!';
  ELSE
    RAISE NOTICE '⚠️  Function works but check similarity scores';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- 7. Final status check
SELECT 
  'SEMANTIC SEARCH STATUS' as status,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as ready_for_search,
  ROUND(100.0 * COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) / COUNT(*), 1) || '%' as coverage
FROM narratives;
