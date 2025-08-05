-- Create a function for vector similarity search on narratives
-- This function will be called via Supabase RPC

-- First ensure the vector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS match_narratives;

-- Create the vector similarity search function
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),  -- Vertex AI gecko embeddings are 768 dimensions
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

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_narratives_embedding ON narratives 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Grant execute permission to authenticated and service role
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role;