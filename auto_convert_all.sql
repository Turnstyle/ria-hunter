-- ============================================================
-- AUTOMATED FULL CONVERSION
-- This will convert ALL embeddings in one go
-- Takes about 2-3 minutes total
-- ============================================================

DO $$
DECLARE
  batch_result RECORD;
  total_converted INT := 0;
  batch_count INT := 0;
  start_time TIMESTAMP := clock_timestamp();
BEGIN
  RAISE NOTICE 'Starting full conversion at %', start_time;
  
  -- Loop until all are converted
  LOOP
    -- Run a batch
    SELECT * INTO batch_result 
    FROM convert_embeddings_batch(500);
    
    -- Exit if nothing left to convert
    EXIT WHEN batch_result.remaining = 0 AND batch_result.converted = 0;
    
    -- Update totals
    total_converted := total_converted + batch_result.converted;
    batch_count := batch_count + 1;
    
    -- Progress report every 10 batches
    IF batch_count % 10 = 0 THEN
      RAISE NOTICE 'Batch %: Converted % total, % remaining', 
        batch_count, total_converted, batch_result.remaining;
    END IF;
    
    -- Small pause to prevent overload
    PERFORM pg_sleep(0.1);
  END LOOP;
  
  RAISE NOTICE '=================================';
  RAISE NOTICE 'CONVERSION COMPLETE!';
  RAISE NOTICE 'Total converted: %', total_converted;
  RAISE NOTICE 'Batches run: %', batch_count;
  RAISE NOTICE 'Time taken: %', clock_timestamp() - start_time;
  RAISE NOTICE '=================================';
END $$;

-- Verify the conversion
SELECT 
  'Final Status' as status,
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as converted,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND (embedding_converted = FALSE OR embedding_converted IS NULL)) as failed_conversion
FROM narratives;
