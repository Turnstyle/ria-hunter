-- Test the match_narratives function directly
SELECT COUNT(*) as total_vectors FROM narratives WHERE embedding_vector IS NOT NULL;

-- Test with a dummy embedding
SELECT * FROM match_narratives(
  (SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768)))::vector(768),
  0.0,  -- Very low threshold to get any matches
  5
);

-- Check if the issue is with the frontend calling the function
-- Test with a simple query that should match something
SELECT 
  crd_number,
  similarity,
  legal_name,
  LEFT(narrative, 100) as narrative_preview
FROM match_narratives(
  (SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
  0.0,
  3
);
