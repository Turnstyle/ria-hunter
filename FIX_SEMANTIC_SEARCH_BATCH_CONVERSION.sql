-- ============================================================
-- PRODUCTION-READY SEMANTIC SEARCH FIX
-- Based on Perplexity's recommendations for safe batch conversion
-- ============================================================

-- Step 1: Add tracking column for safe, resumable conversion
ALTER TABLE narratives 
ADD COLUMN IF NOT EXISTS embedding_converted boolean DEFAULT FALSE;

-- Step 2: Check current status
SELECT 
  'Conversion Status' as status,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as already_converted,
  COUNT(*) FILTER (WHERE embedding_converted = FALSE OR embedding_converted IS NULL) as remaining_to_convert,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding_data
FROM narratives;

-- Step 3: Create a safe batch conversion function
-- This handles the JSON string to vector conversion with error handling
CREATE OR REPLACE FUNCTION convert_embeddings_batch(batch_size INT DEFAULT 500)
RETURNS TABLE(converted INT, remaining INT, errors INT)
LANGUAGE plpgsql
AS $$
DECLARE
  converted_count INT := 0;
  error_count INT := 0;
  remaining_count INT;
BEGIN
  -- Convert a batch of embeddings
  BEGIN
    UPDATE narratives
    SET 
      embedding_vector = embedding::text::vector(768),
      embedding_converted = TRUE
    WHERE 
      embedding IS NOT NULL
      AND (embedding_converted = FALSE OR embedding_converted IS NULL)
      AND octet_length(embedding::text) > 1000  -- Make sure it's a JSON string
    LIMIT batch_size;
    
    GET DIAGNOSTICS converted_count = ROW_COUNT;
    
  EXCEPTION WHEN OTHERS THEN
    -- If batch fails, try one by one for this batch
    FOR r IN 
      SELECT id, embedding 
      FROM narratives 
      WHERE embedding IS NOT NULL 
        AND (embedding_converted = FALSE OR embedding_converted IS NULL)
      LIMIT batch_size
    LOOP
      BEGIN
        UPDATE narratives 
        SET 
          embedding_vector = r.embedding::text::vector(768),
          embedding_converted = TRUE
        WHERE id = r.id;
        
        converted_count := converted_count + 1;
      EXCEPTION WHEN OTHERS THEN
        error_count := error_count + 1;
        RAISE NOTICE 'Failed to convert row %: %', r.id, SQLERRM;
      END;
    END LOOP;
  END;
  
  -- Get remaining count
  SELECT COUNT(*) INTO remaining_count
  FROM narratives 
  WHERE (embedding_converted = FALSE OR embedding_converted IS NULL)
    AND embedding IS NOT NULL;
  
  RETURN QUERY SELECT converted_count, remaining_count, error_count;
END;
$$;

-- Step 4: Run the conversion in batches (run this multiple times until remaining = 0)
-- Each call processes 500 rows and takes ~1-2 seconds
SELECT * FROM convert_embeddings_batch(500);

-- Step 5: Monitor progress
SELECT 
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as converted,
  COUNT(*) FILTER (WHERE embedding_converted = FALSE OR embedding_converted IS NULL) as remaining,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE embedding_converted = TRUE) / 
    NULLIF(COUNT(*) FILTER (WHERE embedding IS NOT NULL), 0), 
    2
  ) as percent_complete
FROM narratives
WHERE embedding IS NOT NULL;

-- Step 6: After all conversions are done, update the match_narratives function
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
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
$$;

-- Step 7: Create HNSW index (after conversion is complete)
-- Per Perplexity: m=16, ef_construction=200 for 768D embeddings
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;

CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Step 8: Analyze table for query planner
ANALYZE narratives;

-- Step 9: Test the semantic search
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
BEGIN
  -- Create test embedding
  test_embedding := (
    SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768))
  )::vector(768);
  
  -- Test the function
  SELECT COUNT(*), MAX(similarity) 
  INTO result_count, top_similarity
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '=================================';
  RAISE NOTICE 'SEMANTIC SEARCH TEST:';
  RAISE NOTICE '  Results found: %', result_count;
  RAISE NOTICE '  Top similarity: %', ROUND(top_similarity::numeric, 3);
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS WORKING!';
  ELSE
    RAISE NOTICE '❌ Still not working - check conversion';
  END IF;
  RAISE NOTICE '=================================';
END $$;

-- Step 10: Final validation
SELECT 
  'FINAL VALIDATION' as check,
  COUNT(*) as total_narratives,
  COUNT(embedding) as has_json_string,
  COUNT(embedding_vector) as has_vector,
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as successfully_converted,
  pg_size_pretty(pg_total_relation_size('narratives_embedding_vector_hnsw_idx')) as index_size
FROM narratives;
