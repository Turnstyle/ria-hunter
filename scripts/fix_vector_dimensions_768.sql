-- Fix all vector search functions to use correct 768 dimensions
-- This matches the current Vertex AI text-embedding-005 model output

-- Drop and recreate the main search function with correct dimensions
DROP FUNCTION IF EXISTS search_rias CASCADE;

CREATE OR REPLACE FUNCTION search_rias(
  query_embedding VECTOR(768),  -- Changed from 384 to 768
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 20,
  state_filter TEXT DEFAULT NULL,
  min_vc_activity FLOAT DEFAULT 0,
  min_aum NUMERIC DEFAULT 0
)
RETURNS TABLE (
  crd_number bigint,
  legal_name text,
  city text,
  state text,
  aum numeric,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  SELECT
    r.crd_number,
    r.legal_name,
    r.city,
    r.state,
    r.aum,
    n.narrative,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM narratives n
  JOIN ria_profiles r ON n.crd_number = r.crd_number
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
    AND (state_filter IS NULL OR r.state = state_filter)
    AND (min_aum = 0 OR r.aum >= min_aum)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Drop and recreate hybrid search function with correct dimensions
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;

CREATE OR REPLACE FUNCTION hybrid_search_rias(
  query_text TEXT,
  query_embedding VECTOR(768),  -- Changed from 384 to 768
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 20,
  state_filter TEXT DEFAULT NULL,
  min_vc_activity FLOAT DEFAULT 0,
  min_aum NUMERIC DEFAULT 0
)
RETURNS TABLE (
  crd_number bigint,
  legal_name text,
  city text,
  state text,
  aum numeric,
  narrative text,
  similarity float,
  text_match_rank float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  WITH vector_matches AS (
    SELECT
      r.crd_number,
      r.legal_name,
      r.city,
      r.state,
      r.aum,
      n.narrative,
      1 - (n.embedding <=> query_embedding) AS similarity,
      0::float AS text_match_rank
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> query_embedding) > match_threshold
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR r.aum >= min_aum)
    ORDER BY n.embedding <=> query_embedding
    LIMIT match_count
  ),
  text_matches AS (
    SELECT
      r.crd_number,
      r.legal_name,
      r.city,
      r.state,
      r.aum,
      n.narrative,
      0::float AS similarity,
      ts_rank(to_tsvector('english', n.narrative), plainto_tsquery('english', query_text)) AS text_match_rank
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE to_tsvector('english', n.narrative) @@ plainto_tsquery('english', query_text)
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR r.aum >= min_aum)
    ORDER BY ts_rank(to_tsvector('english', n.narrative), plainto_tsquery('english', query_text)) DESC
    LIMIT match_count
  )
  SELECT 
    COALESCE(v.crd_number, t.crd_number),
    COALESCE(v.legal_name, t.legal_name),
    COALESCE(v.city, t.city),
    COALESCE(v.state, t.state),
    COALESCE(v.aum, t.aum),
    COALESCE(v.narrative, t.narrative),
    COALESCE(v.similarity, 0),
    COALESCE(t.text_match_rank, 0),
    (COALESCE(v.similarity, 0) * 0.7 + COALESCE(t.text_match_rank, 0) * 0.3) AS combined_score
  FROM vector_matches v
  FULL OUTER JOIN text_matches t ON v.crd_number = t.crd_number
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- Update the simple match_narratives function too
DROP FUNCTION IF EXISTS match_narratives CASCADE;

CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding VECTOR(768),  -- Changed from various dimensions to 768
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  crd_number bigint,
  narrative text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 64;
  
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

-- Grant execute permissions to all functions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role;

-- Verify the embedding column dimensions
SELECT 
    column_name, 
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'narratives' 
AND column_name = 'embedding';

-- Check sample embeddings to confirm dimensions
SELECT 
    crd_number,
    array_length(embedding, 1) as embedding_dimensions,
    embedding IS NOT NULL as has_embedding
FROM narratives 
WHERE embedding IS NOT NULL 
LIMIT 3;
