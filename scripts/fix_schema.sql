-- Fix the embedding column to support 768 dimensions

-- Drop and recreate the embedding column with proper dimensions
ALTER TABLE narratives DROP COLUMN IF EXISTS embedding;
ALTER TABLE narratives ADD COLUMN embedding vector(768);

-- Recreate the index for similarity search  
DROP INDEX IF EXISTS narratives_embedding_idx;
CREATE INDEX narratives_embedding_idx ON narratives 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Update the match function to work with 768-dimensional vectors
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  crd_number int,
  narrative text,
  similarity float
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    narratives.crd_number,
    narratives.narrative,
    1 - (narratives.embedding <=> query_embedding) AS similarity
  FROM narratives
  WHERE narratives.embedding <=> query_embedding < 1 - match_threshold
  ORDER BY narratives.embedding <=> query_embedding
  LIMIT match_count;
$$;