-- Implement hybrid search for RIA Hunter
-- This combines vector similarity search with full-text search
-- for better recall and precision, especially with proper names

-- First, make sure the vector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Also ensure text search configurations are available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes for text search if they don't exist
CREATE INDEX IF NOT EXISTS idx_narratives_trgm ON narratives USING GIN (narrative gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ria_profiles_trgm ON ria_profiles USING GIN (legal_name gin_trgm_ops);

-- Create a hybrid search function that combines vector similarity with text search
CREATE OR REPLACE FUNCTION hybrid_search_rias(
  query_text TEXT,
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 20,
  state_filter TEXT DEFAULT NULL,
  min_vc_activity FLOAT DEFAULT 0,
  min_aum NUMERIC DEFAULT 0
)
RETURNS TABLE (
  crd_number BIGINT,
  legal_name TEXT,
  city TEXT, 
  state TEXT,
  narrative TEXT,
  vector_similarity FLOAT,
  text_match_score FLOAT,
  combined_score FLOAT,
  private_fund_count INT,
  private_fund_aum NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall when using HNSW index
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  WITH 
  -- Vector similarity search
  vector_matches AS (
    SELECT
      r.crd_number,
      r.legal_name,
      r.city,
      r.state,
      n.narrative,
      1 - (n.embedding <=> query_embedding) AS vector_similarity,
      0::FLOAT AS text_match_score,
      COALESCE(r.private_fund_count, 0) AS private_fund_count,
      COALESCE(r.private_fund_aum, 0) AS private_fund_aum
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> query_embedding) > match_threshold
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR COALESCE(r.aum, 0) >= min_aum)
      AND (min_vc_activity = 0 OR COALESCE(r.private_fund_count, 0) >= min_vc_activity)
  ),
  -- Text search using trigram similarity for better name matching
  text_matches AS (
    SELECT
      r.crd_number,
      r.legal_name,
      r.city,
      r.state,
      n.narrative,
      0::FLOAT AS vector_similarity,
      (similarity(n.narrative, query_text) + similarity(r.legal_name, query_text)) / 2 AS text_match_score,
      COALESCE(r.private_fund_count, 0) AS private_fund_count,
      COALESCE(r.private_fund_aum, 0) AS private_fund_aum
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE 
      similarity(n.narrative, query_text) > 0.1 OR
      similarity(r.legal_name, query_text) > 0.1
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR COALESCE(r.aum, 0) >= min_aum)
      AND (min_vc_activity = 0 OR COALESCE(r.private_fund_count, 0) >= min_vc_activity)
  ),
  -- Combine both result sets
  combined_matches AS (
    SELECT
      v.crd_number,
      v.legal_name,
      v.city,
      v.state,
      v.narrative,
      v.vector_similarity,
      0::FLOAT AS text_match_score,
      v.vector_similarity AS combined_score,
      v.private_fund_count,
      v.private_fund_aum
    FROM vector_matches v
    UNION ALL
    SELECT
      t.crd_number,
      t.legal_name,
      t.city,
      t.state,
      t.narrative,
      0::FLOAT AS vector_similarity,
      t.text_match_score,
      t.text_match_score * 0.8 AS combined_score, -- Weight text matches slightly lower
      t.private_fund_count,
      t.private_fund_aum
    FROM text_matches t
  ),
  -- Deduplicate and score using Reciprocal Rank Fusion
  ranked_matches AS (
    SELECT
      crd_number,
      legal_name,
      city,
      state,
      narrative,
      MAX(vector_similarity) AS vector_similarity,
      MAX(text_match_score) AS text_match_score,
      MAX(vector_similarity) + MAX(text_match_score) * 0.8 AS combined_score,
      MAX(private_fund_count) AS private_fund_count,
      MAX(private_fund_aum) AS private_fund_aum
    FROM combined_matches
    GROUP BY crd_number, legal_name, city, state, narrative
  )
  SELECT
    rm.crd_number,
    rm.legal_name,
    rm.city,
    rm.state,
    rm.narrative,
    rm.vector_similarity,
    rm.text_match_score,
    rm.combined_score,
    rm.private_fund_count,
    rm.private_fund_aum
  FROM ranked_matches rm
  ORDER BY rm.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION hybrid_search_rias IS 'Hybrid search combining vector similarity and text similarity for better recall, especially with proper names and specific terms';

-- Grant execute permission to necessary roles
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role;
