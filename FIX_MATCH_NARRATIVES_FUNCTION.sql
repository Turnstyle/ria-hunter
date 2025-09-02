-- ============================================================
-- FIX SEMANTIC SEARCH - Update match_narratives to use correct column
-- ============================================================

-- First, check which column actually has data
SELECT 
  'Data Check' as check_type,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedding_count,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as embedding_vector_count
FROM narratives;

-- Check if the embeddings are actual vectors or strings stored in vector columns
SELECT 
  crd_number,
  array_length(embedding::float[], 1) as embedding_dims,
  array_length(embedding_vector::float[], 1) as embedding_vector_dims,
  (embedding IS NOT NULL) as has_embedding,
  (embedding_vector IS NOT NULL) as has_embedding_vector
FROM narratives
WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL
LIMIT 5;

-- Update the match_narratives function to use the column that has data
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);

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
    1 - (COALESCE(n.embedding_vector, n.embedding) <=> query_embedding) as similarity,
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE (n.embedding_vector IS NOT NULL OR n.embedding IS NOT NULL)
    AND 1 - (COALESCE(n.embedding_vector, n.embedding) <=> query_embedding) > match_threshold
  ORDER BY COALESCE(n.embedding_vector, n.embedding) <=> query_embedding
  LIMIT match_count;
$$;

-- Test the function with a dummy embedding
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
  top_crd TEXT;
  top_name TEXT;
BEGIN
  -- Create test embedding (small random values)
  test_embedding := (
    SELECT ARRAY(
      SELECT (random() * 0.02 - 0.01)::float 
      FROM generate_series(1,768)
    )
  )::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity), 
         (SELECT crd_number FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1),
         (SELECT legal_name FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1)
  INTO result_count, top_similarity, top_crd, top_name
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '=================================';
  RAISE NOTICE 'TEST RESULTS:';
  RAISE NOTICE '  Results found: %', result_count;
  RAISE NOTICE '  Top similarity: %', ROUND(top_similarity::numeric, 3);
  RAISE NOTICE '  Top match: % - %', top_crd, top_name;
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS WORKING!';
  ELSE
    RAISE NOTICE '❌ No results found - check embeddings';
  END IF;
  RAISE NOTICE '=================================';
END $$;

-- Create/update index on the correct column for performance
DROP INDEX IF EXISTS narratives_embedding_idx;
DROP INDEX IF EXISTS narratives_embedding_vector_idx;
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;

-- Create HNSW index on whichever column has data
DO $$
DECLARE
  embedding_count INT;
  embedding_vector_count INT;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE embedding IS NOT NULL),
    COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL)
  INTO embedding_count, embedding_vector_count
  FROM narratives;
  
  IF embedding_vector_count > embedding_count THEN
    RAISE NOTICE 'Creating index on embedding_vector column (% rows)', embedding_vector_count;
    EXECUTE 'CREATE INDEX narratives_embedding_vector_hnsw_idx ON narratives USING hnsw (embedding_vector vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  ELSE
    RAISE NOTICE 'Creating index on embedding column (% rows)', embedding_count;
    EXECUTE 'CREATE INDEX narratives_embedding_hnsw_idx ON narratives USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  END IF;
END $$;

-- Final check
SELECT 
  'FINAL STATUS' as status,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedding_count,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as embedding_vector_count,
  CASE 
    WHEN COUNT(*) FILTER (WHERE embedding IS NOT NULL OR embedding_vector IS NOT NULL) > 40000 
    THEN '✅ READY - Semantic search should work!'
    ELSE '⚠️ Check embeddings'
  END as ready_status
FROM narratives;
