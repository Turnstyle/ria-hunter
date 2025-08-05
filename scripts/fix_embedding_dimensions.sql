-- Fix embedding dimensions to match Vertex AI's textembedding-gecko@003 output
-- This model produces 768-dimensional embeddings

-- First, drop any existing embeddings since they might be the wrong dimension
UPDATE narratives SET embedding = NULL WHERE embedding IS NOT NULL;

-- Now alter the column to the correct dimension
ALTER TABLE narratives 
ALTER COLUMN embedding TYPE vector(768);

-- Create or replace the vector search function with correct dimensions
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  crd_number bigint,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.crd_number,
    n.narrative,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM narratives n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role;