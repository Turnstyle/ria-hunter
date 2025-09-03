-- Fix match_narratives RPC function to use correct column name
-- The function was referencing 'embedding' but data is in 'embedding_vector'

-- Drop existing function
DROP FUNCTION IF EXISTS match_narratives(vector(768), float, int);

-- Create corrected vector similarity search function for narratives
CREATE OR REPLACE FUNCTION match_narratives (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  crd_number integer,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    narratives.crd_number,
    narratives.narrative,
    1 - (narratives.embedding_vector <=> query_embedding) AS similarity
  FROM narratives
  WHERE narratives.embedding_vector IS NOT NULL
    AND 1 - (narratives.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY narratives.embedding_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Drop existing enhanced search function
DROP FUNCTION IF EXISTS search_rias_by_narrative(vector(768), float, int, text, int);

-- Create corrected enhanced search function that joins with RIA profiles
CREATE OR REPLACE FUNCTION search_rias_by_narrative (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 50,
  location_filter text DEFAULT NULL,
  min_private_funds int DEFAULT 0
)
RETURNS TABLE (
  crd_number integer,
  legal_name text,
  narrative text,
  similarity float,
  city text,
  state text,
  private_fund_count int,
  private_fund_aum numeric,
  total_assets numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.crd_number,
    r.legal_name,
    n.narrative,
    1 - (n.embedding_vector <=> query_embedding) AS similarity,
    r.city,
    r.state,
    COALESCE(r.private_fund_count, 0)::int,
    COALESCE(r.private_fund_aum, 0)::numeric,
    COALESCE(r.aum, 0)::numeric
  FROM narratives n
  JOIN ria_profiles r ON n.crd_number = r.crd_number
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
    AND (location_filter IS NULL OR r.state ILIKE location_filter)
    AND COALESCE(r.private_fund_count, 0) >= min_private_funds
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comments to document the functions
COMMENT ON FUNCTION match_narratives IS 
'Semantic similarity search across RIA narratives using vector embeddings stored in embedding_vector column';

COMMENT ON FUNCTION search_rias_by_narrative IS 
'Enhanced semantic search that joins narratives with RIA profile data using embedding_vector column';
