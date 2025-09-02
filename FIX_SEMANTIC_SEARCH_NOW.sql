-- ============================================================
-- SEMANTIC SEARCH FIX - RUN THIS IN SUPABASE SQL EDITOR NOW
-- ============================================================
-- This will fix the semantic search by properly converting embeddings
-- from JSON strings to vector type and updating the search function

-- Step 1: Check current situation
SELECT 
  'Current Status' as check_type,
  COUNT(*) as total_narratives,
  COUNT(embedding) as has_json_string,
  COUNT(embedding_vector) as has_vector_column,
  pg_typeof(embedding_vector) as vector_column_type
FROM narratives
GROUP BY pg_typeof(embedding_vector)
LIMIT 1;

-- Step 2: Drop the incorrectly typed column if it exists
ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_vector;

-- Step 3: Add proper vector column
ALTER TABLE narratives ADD COLUMN embedding_vector vector(768);

-- Step 4: Convert JSON strings to vectors
-- This is the critical fix - converting string embeddings to proper vectors
DO $$
DECLARE
  converted_count INT := 0;
  error_count INT := 0;
  batch_size INT := 500;
  total_to_convert INT;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO total_to_convert
  FROM narratives
  WHERE embedding IS NOT NULL;
  
  RAISE NOTICE 'Starting conversion of % narratives with embeddings', total_to_convert;
  
  -- Process in batches to avoid timeout
  LOOP
    WITH batch AS (
      SELECT id, embedding
      FROM narratives
      WHERE embedding IS NOT NULL 
        AND embedding_vector IS NULL
      LIMIT batch_size
    )
    UPDATE narratives n
    SET embedding_vector = (
      SELECT ARRAY(
        SELECT json_array_elements_text(embedding::json)::float
      )::vector(768)
    )
    FROM batch b
    WHERE n.id = b.id;
    
    GET DIAGNOSTICS converted_count = ROW_COUNT;
    
    EXIT WHEN converted_count = 0;
    
    RAISE NOTICE 'Converted % more embeddings...', converted_count;
    COMMIT;
  END LOOP;
  
  RAISE NOTICE 'Conversion complete!';
END $$;

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
    n.crd_number,
    1 - (n.embedding_vector <=> query_embedding) as similarity,
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
$$;

-- Step 8: Test with a dummy embedding to verify it works
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
BEGIN
  -- Create test embedding
  test_embedding := (SELECT ARRAY(SELECT 0.01::float FROM generate_series(1,768)))::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity) 
  INTO result_count, top_similarity
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE 'Test Results:';
  RAISE NOTICE '  - Function returned % results', result_count;
  RAISE NOTICE '  - Top similarity score: %', top_similarity;
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS NOW WORKING!';
  ELSE
    RAISE NOTICE '⚠️ Function works but no results - check embeddings';
  END IF;
END $$;

-- Step 9: Show final statistics
SELECT 
  'FINAL STATUS' as report,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as json_embeddings,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as vector_embeddings,
  COUNT(*) FILTER (WHERE embedding_vector IS NULL AND embedding IS NOT NULL) as failed_conversions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) > 40000 THEN '✅ READY FOR PRODUCTION'
    WHEN COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) > 1000 THEN '⚠️ PARTIALLY READY'
    ELSE '❌ NEEDS ATTENTION'
  END as status
FROM narratives;

-- ============================================================
-- DONE! Semantic search should now be working.
-- Test it by running a query in your application.
-- ============================================================
