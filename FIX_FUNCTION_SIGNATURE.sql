-- ============================================================
-- FIX FUNCTION SIGNATURE - Drop and recreate
-- ============================================================

-- 1. Copy vectors first (this should work)
UPDATE narratives 
SET embedding_vector = embedding
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- 2. Drop the existing function completely
DROP FUNCTION IF EXISTS match_narratives(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);
DROP FUNCTION IF EXISTS match_narratives;

-- 3. Create the new function with correct signature
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
    n.legal_name,
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
SELECT COUNT(*) as vectors_ready FROM narratives WHERE embedding_vector IS NOT NULL;

-- 7. Quick test
DO $$
DECLARE
  test_count INT;
BEGIN
  SELECT COUNT(*) INTO test_count
  FROM match_narratives(
    (SELECT ARRAY(SELECT random() * 0.02 - 0.01 FROM generate_series(1,768)))::vector(768),
    0.0,
    5
  );
  
  IF test_count > 0 THEN
    RAISE NOTICE '✅ SUCCESS! Found % matches - Semantic search is working!', test_count;
  ELSE
    RAISE NOTICE '⚠️  Function works but no matches found';
  END IF;
END $$;
