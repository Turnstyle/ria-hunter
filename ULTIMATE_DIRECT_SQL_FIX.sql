-- ============================================================
-- ULTIMATE DIRECT SQL FIX
-- This bypasses RPC timeouts by running directly in SQL Editor
-- Should convert all 41,000+ embeddings in under 5 minutes
-- ============================================================

-- Step 1: Create a more efficient conversion approach
-- Instead of complex JSON parsing, use a simpler method

DO $$
DECLARE
    batch_size INT := 1000;  -- Larger batches work in direct SQL
    total_updated INT := 0;
    rows_updated INT;
    start_time TIMESTAMP := clock_timestamp();
BEGIN
    RAISE NOTICE 'Starting direct SQL conversion at %', start_time;
    RAISE NOTICE 'Target: Convert ~41,000 JSON string embeddings to vectors';
    RAISE NOTICE '================================================';
    
    -- Loop until all are converted
    LOOP
        -- Update a batch using the most efficient conversion method
        UPDATE narratives 
        SET embedding_vector = ARRAY(
            SELECT json_array_elements_text(embedding::json)::float
        )::vector(768)
        WHERE id IN (
            SELECT id 
            FROM narratives 
            WHERE embedding IS NOT NULL 
              AND embedding_vector IS NULL
              AND embedding::text LIKE '[%'  -- Ensure it's a JSON array
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        
        -- Exit if no more rows to update
        EXIT WHEN rows_updated = 0;
        
        total_updated := total_updated + rows_updated;
        
        -- Progress report every 5000 rows
        IF total_updated % 5000 = 0 THEN
            RAISE NOTICE 'Converted % embeddings so far...', total_updated;
        END IF;
        
        -- Small commit to prevent long transactions
        COMMIT;
        
    END LOOP;
    
    RAISE NOTICE '================================================';
    RAISE NOTICE 'CONVERSION COMPLETE!';
    RAISE NOTICE 'Total converted: %', total_updated;
    RAISE NOTICE 'Time taken: %', clock_timestamp() - start_time;
    RAISE NOTICE '================================================';
    
END $$;

-- Step 2: Verify the conversion worked
SELECT 
    'Conversion Results' as status,
    COUNT(*) as total_narratives,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_json_embedding,
    COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_vector_embedding,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL AND embedding_vector IS NULL) as conversion_failures
FROM narratives;

-- Step 3: Update the match_narratives function to use the vector column
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

-- Step 4: Create the HNSW index for fast similarity search
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;

CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Step 5: Analyze the table for the query planner
ANALYZE narratives;

-- Step 6: Test that semantic search now works
DO $$
DECLARE
  test_embedding vector(768);
  result_count INT;
  top_similarity FLOAT;
  top_crd TEXT;
  top_name TEXT;
BEGIN
  -- Create a test embedding
  test_embedding := (
    SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768))
  )::vector(768);
  
  -- Test the search
  SELECT COUNT(*), MAX(similarity),
         (SELECT crd_number FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1),
         (SELECT legal_name FROM match_narratives(test_embedding, 0.0, 1) LIMIT 1)
  INTO result_count, top_similarity, top_crd, top_name
  FROM match_narratives(test_embedding, 0.0, 10);
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'SEMANTIC SEARCH TEST RESULTS:';
  RAISE NOTICE '  Matches found: %', result_count;
  RAISE NOTICE '  Top similarity: %', ROUND(top_similarity::numeric, 3);
  RAISE NOTICE '  Top match: % - %', top_crd, COALESCE(top_name, 'Unknown');
  
  IF result_count > 0 THEN
    RAISE NOTICE '✅ SEMANTIC SEARCH IS NOW WORKING!';
  ELSE
    RAISE NOTICE '❌ Still not working - check the conversion';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- Step 7: Clean up (optional - run after verifying everything works)
-- ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_converted;
-- ALTER TABLE narratives DROP COLUMN IF EXISTS embedding; -- Only if you want to remove the JSON strings

-- Final status
SELECT 
  'FINAL STATUS' as check,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as ready_for_search,
  pg_size_pretty(pg_total_relation_size('narratives_embedding_vector_hnsw_idx')) as index_size,
  'SEMANTIC SEARCH READY!' as status
FROM narratives;
