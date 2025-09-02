-- FIX SEMANTIC SEARCH: Convert JSON string embeddings to proper vectors
-- Run this in Supabase SQL Editor

-- Step 1: Check current state
SELECT 
  COUNT(*) as total_narratives,
  COUNT(embedding) as has_embedding_string,
  COUNT(embedding_vector) as has_embedding_vector
FROM narratives;

-- Step 2: Add vector column if it doesn't exist
ALTER TABLE narratives 
ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

-- Step 3: Convert JSON strings to vectors (this might take a while)
-- Process in smaller batches to avoid timeout
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT;
  processed_rows INT := 0;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO total_rows 
  FROM narratives 
  WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL;
  
  RAISE NOTICE 'Starting conversion of % rows', total_rows;
  
  -- Process in batches
  WHILE processed_rows < total_rows LOOP
    UPDATE narratives 
    SET embedding_vector = embedding::json::text::vector(768)
    WHERE id IN (
      SELECT id 
      FROM narratives 
      WHERE embedding IS NOT NULL 
        AND embedding_vector IS NULL
      LIMIT batch_size
    );
    
    processed_rows := processed_rows + batch_size;
    RAISE NOTICE 'Processed % of % rows', LEAST(processed_rows, total_rows), total_rows;
    
    -- Small delay to prevent overload
    PERFORM pg_sleep(0.1);
  END LOOP;
  
  RAISE NOTICE 'Conversion complete!';
END $$;

-- Step 4: Verify conversion
SELECT 
  COUNT(*) as total_narratives,
  COUNT(embedding_vector) as vectors_created,
  COUNT(embedding) - COUNT(embedding_vector) as remaining_to_convert
FROM narratives
WHERE embedding IS NOT NULL;

-- Step 5: Create HNSW index for fast similarity search
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 6: Update the match_narratives function to use vector column
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
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
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
END;
$$;

-- Step 7: Test the function with a dummy embedding
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
BEGIN
  -- Create a test embedding (all 0.01 values)
  test_embedding := array_fill(0.01::float, ARRAY[768])::vector(768);
  
  -- Test the function
  SELECT COUNT(*) INTO result_count
  FROM match_narratives(test_embedding, 0.1, 5);
  
  RAISE NOTICE 'Test query returned % results', result_count;
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ Semantic search is now working!';
  ELSE
    RAISE NOTICE '⚠️ No results found - check if embeddings are properly stored';
  END IF;
END $$;

-- Step 8: Show final status
SELECT 
  'Semantic Search Status' as metric,
  CASE 
    WHEN COUNT(embedding_vector) > 40000 THEN '✅ READY - ' || COUNT(embedding_vector) || ' vectors indexed'
    WHEN COUNT(embedding_vector) > 0 THEN '⚠️ PARTIAL - ' || COUNT(embedding_vector) || ' vectors indexed'
    ELSE '❌ NOT READY - No vectors found'
  END as status
FROM narratives
WHERE embedding_vector IS NOT NULL;
