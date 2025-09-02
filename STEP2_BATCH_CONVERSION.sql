-- ============================================================
-- STEP 2: BATCH CONVERSION
-- Run this repeatedly to convert all embeddings
-- ============================================================

-- Convert 500 at a time (safe for Supabase timeout limits)
SELECT * FROM convert_embeddings_batch(500);

-- Check progress after each batch
SELECT 
  'Progress' as status,
  COUNT(*) FILTER (WHERE embedding_converted = TRUE) as converted,
  COUNT(*) FILTER (WHERE embedding_converted = FALSE OR embedding_converted IS NULL) as remaining,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE embedding_converted = TRUE) / 
    NULLIF(COUNT(*) FILTER (WHERE embedding IS NOT NULL), 0), 
    2
  ) || '%' as percent_complete
FROM narratives
WHERE embedding IS NOT NULL;

-- IMPORTANT: Keep running this until remaining = 0
-- SELECT * FROM convert_embeddings_batch(500);
-- 
-- You need to run it about 83 times (41,303 ÷ 500)
-- Each batch takes 1-2 seconds
