-- ============================================================
-- FIX GENERATIVE NARRATIVES PROCESS - UPDATED VERSION
-- ============================================================
-- Run this in Supabase SQL Editor

-- Step 1: Check current situation
SELECT 
  'Current Status' as check_type,
  COUNT(*) as total_narratives,
  COUNT(embedding) as has_embedding,
  COUNT(embedding_vector) as has_vector_column,
  pg_typeof(embedding) as embedding_type,
  pg_typeof(embedding_vector) as vector_column_type
FROM narratives
GROUP BY pg_typeof(embedding), pg_typeof(embedding_vector)
LIMIT 10;

-- Step 2: Drop the incorrectly typed column if it exists
ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_vector;

-- Step 3: Add proper vector column
ALTER TABLE narratives ADD COLUMN embedding_vector vector(768);

-- Step 4: Copy vector data directly (since embedding is already vector type)
UPDATE narratives 
SET embedding_vector = embedding::vector(768)
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Step 5: Verify conversion worked
SELECT 
  'After Conversion' as status,
  COUNT(*) as total_narratives,
  COUNT(embedding_vector) as vectors_created,
  pg_typeof(embedding_vector) as vector_type
FROM narratives
WHERE embedding_vector IS NOT NULL
GROUP BY pg_typeof(embedding_vector);

-- Step 6: Create HNSW index for fast similarity search
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;

CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 7: Replace the match_narratives function
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);
DROP FUNCTION IF EXISTS match_narratives(vector, float, int);

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
LANGUAGE sql
STABLE
AS $$
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_narratives(vector(768), float, int) TO anon, authenticated, service_role;

-- Step 8: Test with a dummy embedding to verify it works
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
BEGIN
  -- Create test embedding
  test_embedding := (SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768)))::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity) 
  INTO result_count, top_similarity
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Test Results:';
  RAISE NOTICE '  - Function returned % results', result_count;
  RAISE NOTICE '  - Top similarity score: %', top_similarity;
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS NOW WORKING!';
  ELSE
    RAISE NOTICE '⚠️ Function works but no results - check embeddings';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- Step 9: Show final statistics
SELECT 
  'FINAL STATUS' as report,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embeddings,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as vector_embeddings,
  COUNT(*) FILTER (WHERE embedding_vector IS NULL AND embedding IS NOT NULL) as failed_conversions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) > 40000 THEN '✅ READY FOR PRODUCTION'
    WHEN COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) > 1000 THEN '⚠️ PARTIALLY READY'
    ELSE '❌ NEEDS ATTENTION'
  END as status
FROM narratives;

-- ============================================================
-- DONE! Generative narratives process should now be working.
-- ============================================================
