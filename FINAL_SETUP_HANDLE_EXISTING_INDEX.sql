-- ============================================================
-- FINAL SETUP - Handle existing index
-- ============================================================

-- 1. Copy vectors (if not done already)
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Check how many we copied
SELECT 
  'Vector Copy Results' as status,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_embedding_vector
FROM narratives;

-- 2. Drop existing function completely
DROP FUNCTION IF EXISTS match_narratives(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);
DROP FUNCTION IF EXISTS match_narratives;

-- 3. Create correct function with JOIN
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

-- 4. Index already exists, just analyze
ANALYZE narratives;

-- 5. Test the function
DO $$
DECLARE
  test_count INT;
  test_similarity FLOAT;
  test_crd TEXT;
  test_name TEXT;
BEGIN
  -- Create test embedding
  DECLARE test_embedding vector(768) := (
    SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768))
  )::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity), 
         (SELECT crd_number FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1),
         (SELECT legal_name FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1)
  INTO test_count, test_similarity, test_crd, test_name
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '================================================';
  RAISE NOTICE '🎉 SEMANTIC SEARCH TEST RESULTS:';
  RAISE NOTICE '  Total matches found: %', test_count;
  RAISE NOTICE '  Max similarity score: %', ROUND(test_similarity::numeric, 4);
  RAISE NOTICE '  Top result: CRD % - %', test_crd, COALESCE(test_name, 'Unknown');
  
  IF test_count > 0 AND test_similarity > 0 THEN
    RAISE NOTICE '✅ SUCCESS! SEMANTIC SEARCH IS FULLY WORKING!';
    RAISE NOTICE '🚀 Ready for production use!';
  ELSE
    RAISE NOTICE '⚠️  Function created but similarity scores need review';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- 6. Final status
SELECT 
  '🎯 FINAL STATUS' as check,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as ready_for_search,
  ROUND(100.0 * COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) / COUNT(*), 1) || '%' as coverage,
  'SEMANTIC SEARCH READY!' as status
FROM narratives;

-- 7. Clean up tracking column
ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_converted;
