-- Complete setup for embeddings in RIA Hunter
-- Run this in Supabase SQL editor

-- 1. Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Check if narratives table has embedding column and fix dimensions
DO $$ 
BEGIN
  -- Check if embedding column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'narratives' 
    AND column_name = 'embedding'
  ) THEN
    -- Add embedding column with correct dimensions for Vertex AI gecko
    ALTER TABLE public.narratives ADD COLUMN embedding vector(768);
  ELSE
    -- Column exists, ensure it has correct dimensions
    -- First clear any existing embeddings that might be wrong dimension
    UPDATE narratives SET embedding = NULL WHERE embedding IS NOT NULL;
    
    -- Then alter to correct dimension
    ALTER TABLE narratives ALTER COLUMN embedding TYPE vector(768);
  END IF;
END $$;

-- 3. Create vector similarity search function
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

-- 4. Create index for better performance (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'narratives' 
    AND indexname = 'idx_narratives_embedding'
  ) THEN
    CREATE INDEX idx_narratives_embedding ON narratives 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  END IF;
END $$;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role;

-- 6. Create a simple exec function for the embedding script
CREATE OR REPLACE FUNCTION exec(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Grant permission to service role
GRANT EXECUTE ON FUNCTION exec TO service_role;

-- 7. Verify setup
SELECT 
  'Setup complete!' as status,
  (SELECT COUNT(*) FROM narratives) as total_narratives,
  (SELECT COUNT(*) FROM narratives WHERE embedding IS NOT NULL) as narratives_with_embeddings;