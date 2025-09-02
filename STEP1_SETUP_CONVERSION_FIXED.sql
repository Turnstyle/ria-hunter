-- ============================================================
-- STEP 1: SETUP FOR BATCH CONVERSION (FIXED)
-- Run this entire script first in Supabase SQL Editor
-- ============================================================

-- Add tracking column for safe, resumable conversion
ALTER TABLE narratives 
ADD COLUMN IF NOT EXISTS embedding_converted boolean DEFAULT FALSE;

-- Check current status
SELECT 
  'Initial Status' as status,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding_data,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as has_vector_data,
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as already_converted
FROM narratives;

-- Create the batch conversion function (FIXED VERSION)
CREATE OR REPLACE FUNCTION convert_embeddings_batch(batch_size INT DEFAULT 500)
RETURNS TABLE(converted INT, remaining INT, errors INT)
LANGUAGE plpgsql
AS $$
DECLARE
  converted_count INT := 0;
  error_count INT := 0;
  remaining_count INT;
  r RECORD;
BEGIN
  -- Convert a batch of embeddings using subquery for LIMIT
  BEGIN
    UPDATE narratives
    SET 
      embedding_vector = embedding::text::vector(768),
      embedding_converted = TRUE
    WHERE id IN (
      SELECT id 
      FROM narratives 
      WHERE embedding IS NOT NULL
        AND (embedding_converted = FALSE OR embedding_converted IS NULL)
        AND octet_length(embedding::text) > 1000  -- Make sure it's a JSON string
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS converted_count = ROW_COUNT;
    
  EXCEPTION WHEN OTHERS THEN
    -- If batch fails, try one by one for this batch
    converted_count := 0;
    FOR r IN 
      SELECT id, embedding 
      FROM narratives 
      WHERE embedding IS NOT NULL 
        AND (embedding_converted = FALSE OR embedding_converted IS NULL)
        AND octet_length(embedding::text) > 1000
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

-- Test that the function was created successfully
SELECT * FROM convert_embeddings_batch(1);

-- If you see results, the function is ready!
-- You should see something like: converted | remaining | errors
--                                 1        | 41302     | 0
