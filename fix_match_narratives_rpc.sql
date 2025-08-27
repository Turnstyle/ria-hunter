-- Fix for match_narratives RPC to handle JSON string embeddings
-- This avoids needing to regenerate all embeddings
-- Run this in Supabase SQL Editor

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS match_narratives(vector, float, int);

-- Create improved version that handles JSON strings
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
) 
RETURNS TABLE(
  crd_number int,
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
    1 - (
      query_embedding <=> 
      CASE 
        -- If embedding is stored as JSON string, parse it
        WHEN n.embedding::text LIKE '[%' THEN 
          n.embedding::json::text::vector(768)
        -- Otherwise use as-is
        ELSE 
          n.embedding::vector(768)
      END
    ) as similarity
  FROM narratives n
  WHERE n.embedding IS NOT NULL
  AND 1 - (
    query_embedding <=> 
    CASE 
      WHEN n.embedding::text LIKE '[%' THEN 
        n.embedding::json::text::vector(768)
      ELSE 
        n.embedding::vector(768)
    END
  ) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_narratives(vector, float, int) TO anon, authenticated, service_role;

-- Test the function
-- This should return results if embeddings exist
SELECT COUNT(*) as total_narratives_with_embeddings
FROM narratives 
WHERE embedding IS NOT NULL;
