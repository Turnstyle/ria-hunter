-- Set a longer statement timeout (10 minutes) to allow for index creation
SET statement_timeout = '600000';

-- Create HNSW index for ultra-fast vector search
CREATE INDEX IF NOT EXISTS narratives_embedding_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Wait for index to be usable
SELECT pg_sleep(1);

-- Test the index with EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT * FROM narratives
WHERE embedding_vector IS NOT NULL
ORDER BY embedding_vector <=> (
  SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1
)
LIMIT 5;
