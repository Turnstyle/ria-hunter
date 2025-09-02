-- ============================================================
-- SAFE BATCH CONVERSION - Smaller batches to avoid timeouts
-- ============================================================

-- Start with smaller batches of 100 rows (much safer for Supabase)
SELECT * FROM convert_embeddings_batch(100);

-- Check progress
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

-- Keep running: SELECT * FROM convert_embeddings_batch(100);
-- Until remaining = 0

-- Alternative: Even smaller batches if still timing out
-- SELECT * FROM convert_embeddings_batch(50);
-- or
-- SELECT * FROM convert_embeddings_batch(25);
