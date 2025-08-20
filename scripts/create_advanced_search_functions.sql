-- Create advanced search functions for RIA Hunter

-- Create enhanced search function that supports filtering
CREATE OR REPLACE FUNCTION search_rias(
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 20,
  state_filter TEXT DEFAULT NULL,
  min_vc_activity FLOAT DEFAULT 0,
  min_aum NUMERIC DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  sec_number TEXT,
  city TEXT,
  state TEXT,
  aum NUMERIC,
  employee_count INTEGER,
  narrative_text TEXT,
  similarity FLOAT,
  vc_activity_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.sec_number,
    r.city,
    r.state,
    r.aum,
    r.employee_count,
    n.narrative_text,
    1 - (n.embedding <=> query_embedding) AS similarity,
    compute_vc_activity(r.id) AS vc_activity_score
  FROM narratives n
  JOIN ria_profiles r ON n.ria_id = r.id
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
    AND (state_filter IS NULL OR r.state = state_filter)
    AND (min_aum = 0 OR r.aum >= min_aum)
    AND (min_vc_activity = 0 OR compute_vc_activity(r.id) >= min_vc_activity)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create a hybrid search function that combines vector search with text search
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
  id UUID,
  name TEXT,
  sec_number TEXT,
  city TEXT,
  state TEXT,
  aum NUMERIC,
  employee_count INTEGER,
  narrative_text TEXT,
  similarity FLOAT,
  text_match_rank FLOAT,
  combined_score FLOAT,
  vc_activity_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  WITH vector_matches AS (
    SELECT
      r.id,
      r.name,
      r.sec_number,
      r.city,
      r.state,
      r.aum,
      r.employee_count,
      n.narrative_text,
      1 - (n.embedding <=> query_embedding) AS similarity,
      0 AS text_match_rank,
      compute_vc_activity(r.id) AS vc_activity_score
    FROM narratives n
    JOIN ria_profiles r ON n.ria_id = r.id
    WHERE n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> query_embedding) > match_threshold
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR r.aum >= min_aum)
      AND (min_vc_activity = 0 OR compute_vc_activity(r.id) >= min_vc_activity)
  ),
  text_matches AS (
    SELECT
      r.id,
      r.name,
      r.sec_number,
      r.city,
      r.state,
      r.aum,
      r.employee_count,
      n.narrative_text,
      0 AS similarity,
      ts_rank(to_tsvector('english', n.narrative_text), plainto_tsquery('english', query_text)) AS text_match_rank,
      compute_vc_activity(r.id) AS vc_activity_score
    FROM narratives n
    JOIN ria_profiles r ON n.ria_id = r.id
    WHERE to_tsvector('english', n.narrative_text) @@ plainto_tsquery('english', query_text)
      AND (state_filter IS NULL OR r.state = state_filter)
      AND (min_aum = 0 OR r.aum >= min_aum)
      AND (min_vc_activity = 0 OR compute_vc_activity(r.id) >= min_vc_activity)
  ),
  combined_matches AS (
    SELECT
      v.id,
      v.name,
      v.sec_number,
      v.city,
      v.state,
      v.aum,
      v.employee_count,
      v.narrative_text,
      v.similarity,
      COALESCE(t.text_match_rank, 0) AS text_match_rank,
      (v.similarity * 0.7) + (COALESCE(t.text_match_rank, 0) * 0.3) AS combined_score,
      v.vc_activity_score
    FROM vector_matches v
    LEFT JOIN text_matches t ON v.id = t.id
    
    UNION
    
    SELECT
      t.id,
      t.name,
      t.sec_number,
      t.city,
      t.state,
      t.aum,
      t.employee_count,
      t.narrative_text,
      COALESCE(v.similarity, 0) AS similarity,
      t.text_match_rank,
      (COALESCE(v.similarity, 0) * 0.7) + (t.text_match_rank * 0.3) AS combined_score,
      t.vc_activity_score
    FROM text_matches t
    LEFT JOIN vector_matches v ON t.id = v.id
    WHERE t.id NOT IN (SELECT id FROM vector_matches)
  )
  
  SELECT *
  FROM combined_matches
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- Create a function to get executives (control persons) for a firm
CREATE OR REPLACE FUNCTION get_firm_executives(
  firm_id UUID
)
RETURNS TABLE (
  name TEXT,
  position TEXT,
  ownership_percent NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.name,
    cp.position,
    cp.ownership_percent
  FROM control_persons cp
  WHERE cp.ria_id = firm_id
  ORDER BY cp.ownership_percent DESC NULLS LAST;
END;
$$;

-- Create a function to get private funds for a firm
CREATE OR REPLACE FUNCTION get_firm_private_funds(
  firm_id UUID
)
RETURNS TABLE (
  fund_name TEXT,
  fund_type TEXT,
  aum NUMERIC,
  currency TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pf.fund_name,
    pf.fund_type,
    pf.aum,
    pf.currency
  FROM ria_private_funds pf
  WHERE pf.ria_id = firm_id
  ORDER BY pf.aum DESC NULLS LAST;
END;
$$;
