-- ============================================================
-- FIXED FUNCTION - Without legal_name column
-- ============================================================

-- 1. Copy vectors (if not done already)
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- 2. Drop existing function
DROP FUNCTION IF EXISTS match_narratives(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);
DROP FUNCTION IF EXISTS match_narratives;

-- 3. Create simplified function (without legal_name)
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
LANGUAGE sql STABLE AS $$
  SELECT 
    n.crd_number::text,
    1 - (n.embedding_vector <=> query_embedding) as similarity,
    'Unknown'::text as legal_name,  -- Placeholder since column doesn't exist
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
$$;

-- 4. Create HNSW index
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- 5. Analyze table
ANALYZE narratives;

-- 6. Test it works
DO $$
DECLARE
  test_count INT;
  test_similarity FLOAT;
BEGIN
  SELECT COUNT(*), MAX(similarity) INTO test_count, test_similarity
  FROM match_narratives(
    (SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768)))::vector(768),
    0.0,
    5
  );
  
  RAISE NOTICE '================================================';
  IF test_count > 0 THEN
    RAISE NOTICE '✅ SUCCESS! Found % matches with max similarity %', test_count, ROUND(test_similarity::numeric, 3);
    RAISE NOTICE '🎉 SEMANTIC SEARCH IS NOW WORKING!';
  ELSE
    RAISE NOTICE '⚠️  Function created but no matches found';
  END IF;
  RAISE NOTICE '================================================';
END $$;

-- 7. Final status
SELECT 
  COUNT(*) as total_narratives,
  COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL) as ready_for_search
FROM narratives;
