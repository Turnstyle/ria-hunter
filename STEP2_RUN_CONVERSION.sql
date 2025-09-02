-- ============================================================
-- STEP 2: RUN THE CONVERSION
-- Run this repeatedly until remaining = 0
-- ============================================================

-- Each execution converts 500 rows (takes 1-2 seconds)
SELECT * FROM convert_embeddings_batch(500);

-- Check progress
SELECT 
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as converted,
  COUNT(*) FILTER (WHERE embedding_converted = FALSE OR embedding_converted IS NULL) as remaining,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE embedding_converted = TRUE) / 
    NULLIF(COUNT(*) FILTER (WHERE embedding IS NOT NULL), 0), 
    2
  ) || '%' as percent_complete
FROM narratives
WHERE embedding IS NOT NULL;

-- Keep running: SELECT * FROM convert_embeddings_batch(500);
-- Until remaining = 0
