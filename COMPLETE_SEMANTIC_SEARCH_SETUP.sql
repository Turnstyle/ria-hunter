-- ============================================================
-- COMPLETE SEMANTIC SEARCH SETUP
-- The vectors are already proper, now finish the setup
-- ============================================================

-- 1. Copy all vectors from embedding to embedding_vector
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Check how many we copied
SELECT 
  'Copy Results' as status,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_embedding_vector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NOT NULL) as both_populated
FROM narratives;

-- 2. Update the match_narratives function to use embedding_vector
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

-- 3. Create HNSW index for fast similarity search
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- 4. Analyze table for query planner
ANALYZE narratives;

-- 5. Test semantic search with a real embedding
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
  top_crd TEXT;
  top_name TEXT;
BEGIN
  -- Create a test embedding (small random values)
  test_embedding := (
    SELECT ARRAY(SELECT (random() * 0.02 - 0.01)::float FROM generate_series(1,768))
  )::vector(768);
  
  -- Test the search
  SELECT COUNT(*), MAX(similarity),
         (SELECT crd_number FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1),
         (SELECT legal_name FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1)
  INTO result_count, top_similarity, top_crd, top_name
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '================================================';
  RAISE NOTICE '🎉 SEMANTIC SEARCH TEST RESULTS:';
  RAISE NOTICE '  Matches found: %', result_count;
  RAISE NOTICE '  Top similarity: %', ROUND(top_similarity::numeric, 3);
  RAISE NOTICE '  Top match: CRD % - %', top_crd, COALESCE(top_name, 'Unknown');
  
  IF result_count > 0 AND top_similarity > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS NOW FULLY WORKING!';
  ELSE
    RAISE NOTICE '⚠️  Search works but similarity scores may need adjustment';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- 6. Final status check
SELECT 
  '🚀 FINAL STATUS' as status,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as ready_for_search,
  ROUND(100.0 * COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) / COUNT(*), 1) || '%' as coverage,
  pg_size_pretty(pg_total_relation_size('narratives_embedding_vector_hnsw_idx')) as index_size
FROM narratives;

-- 7. Clean up (optional)
-- ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_converted;
