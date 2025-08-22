-- EXECUTE THIS IN SUPABASE SQL EDITOR NOW
-- This will convert all 41,303 embeddings from JSON strings to vector(768) format

-- Step 1: Create/update the conversion function
CREATE OR REPLACE FUNCTION convert_json_to_vector(json_str text)
RETURNS vector(768)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Direct conversion from JSON string to vector
    RETURN json_str::json::text::vector(768);
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Step 2: Test conversion with 10 records first
UPDATE narratives 
SET embedding_vector = convert_json_to_vector(embedding)
WHERE embedding_vector IS NULL 
  AND embedding IS NOT NULL
  AND id IN (
    SELECT id FROM narratives 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL 
    LIMIT 10
  );

-- Step 3: Check test results
SELECT 
    'TEST RESULTS' as status,
    COUNT(*) as total_narratives,
    COUNT(embedding) as string_embeddings,
    COUNT(embedding_vector) as vector_embeddings,
    ROUND(COUNT(embedding_vector)::decimal / COUNT(embedding) * 100, 2) as conversion_rate
FROM narratives
WHERE embedding IS NOT NULL;

-- Step 4: Full conversion in optimized batches
DO $$
DECLARE
    batch_size INTEGER := 5000;
    batch_count INTEGER;
    total_processed INTEGER := 0;
    iteration INTEGER := 0;
    start_time TIMESTAMP;
    elapsed INTERVAL;
BEGIN
    start_time := clock_timestamp();
    
    RAISE NOTICE 'Starting full embedding conversion...';
    
    LOOP
        iteration := iteration + 1;
        
        -- Update next batch
        UPDATE narratives 
        SET embedding_vector = convert_json_to_vector(embedding)
        WHERE id IN (
            SELECT id 
            FROM narratives 
            WHERE embedding IS NOT NULL 
              AND embedding_vector IS NULL
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS batch_count = ROW_COUNT;
        total_processed := total_processed + batch_count;
        
        elapsed := clock_timestamp() - start_time;
        
        RAISE NOTICE 'Batch %: Processed % embeddings (total: %, elapsed: %)', 
                    iteration, batch_count, total_processed, elapsed;
        
        -- Exit if no more rows to process
        IF batch_count = 0 THEN
            RAISE NOTICE 'SUCCESS! Conversion complete! Total processed: %, Duration: %', 
                        total_processed, elapsed;
            EXIT;
        END IF;
        
        -- Safety check - don't run forever
        IF iteration > 20 THEN
            RAISE NOTICE 'Stopping after % iterations for safety (processed %)', iteration, total_processed;
            EXIT;
        END IF;
        
        -- Small pause between batches to prevent system overload
        PERFORM pg_sleep(0.2);
    END LOOP;
END $$;

-- Step 5: Final verification
SELECT 
    '=== CONVERSION SUMMARY ===' as status,
    COUNT(*) as total_narratives,
    COUNT(embedding) as string_embeddings,
    COUNT(embedding_vector) as vector_embeddings,
    ROUND(COUNT(embedding_vector)::decimal / COUNT(embedding) * 100, 2) as conversion_rate,
    -- Sample dimension check
    array_length(
        (SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1)::float[], 
        1
    ) as sample_vector_dimension
FROM narratives
WHERE embedding IS NOT NULL;

-- Step 6: Create vector search functions
CREATE OR REPLACE FUNCTION match_narratives(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 10
)
RETURNS TABLE(
    crd_number bigint,
    narrative text,
    similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        crd_number,
        narrative,
        1 - (embedding_vector <=> query_embedding) as similarity
    FROM narratives
    WHERE embedding_vector IS NOT NULL
      AND (1 - (embedding_vector <=> query_embedding)) > match_threshold
    ORDER BY embedding_vector <=> query_embedding
    LIMIT match_count;
$$;

-- Enhanced search function with RIA profile joins
CREATE OR REPLACE FUNCTION search_rias_vector(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 10,
    state_filter text DEFAULT NULL
)
RETURNS TABLE(
    crd_number bigint,
    narrative_text text,
    similarity_score float,
    firm_name text,
    city text,
    state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        n.crd_number,
        n.narrative as narrative_text,
        1 - (n.embedding_vector <=> query_embedding) as similarity_score,
        r.legal_name as firm_name,
        r.city,
        r.state
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
      AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
      AND (state_filter IS NULL OR r.state ILIKE state_filter)
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
$$;

-- Step 7: Grant permissions
GRANT EXECUTE ON FUNCTION match_narratives TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_rias_vector TO anon, authenticated, service_role;

-- Step 8: Performance test
SELECT 'PERFORMANCE TEST - Should complete in <1000ms' as test_info;
SELECT * FROM match_narratives(
    ARRAY[0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1]::vector(768),
    0.7,
    5
);
