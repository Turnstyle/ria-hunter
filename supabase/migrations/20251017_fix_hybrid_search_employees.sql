-- Migration: 20251017_fix_hybrid_search_employees
-- Purpose: align hybrid_search_rias with production schema (no employees column)

DROP FUNCTION IF EXISTS hybrid_search_rias(
  query_text TEXT,
  query_embedding VECTOR(768),
  location_city TEXT,
  location_state TEXT,
  limit_count INTEGER,
  offset_count INTEGER
);

CREATE OR REPLACE FUNCTION hybrid_search_rias(
  query_text TEXT,
  query_embedding VECTOR(768),
  location_city TEXT DEFAULT NULL,
  location_state TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 10,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  crd_number BIGINT,
  firm_name TEXT,
  city TEXT,
  state TEXT,
  aum NUMERIC,
  employees INTEGER,
  private_fund_count INTEGER,
  combined_rank FLOAT,
  semantic_score FLOAT,
  fts_score FLOAT,
  location_match_score FLOAT
) AS $$
DECLARE
  semantic_weight FLOAT := 1.0;
  fts_weight FLOAT := 0.8;
  rrf_k INTEGER := 50;
BEGIN
  IF query_text IS NULL OR trim(query_text) = '' THEN
    RAISE EXCEPTION 'Query text cannot be empty';
  END IF;

  IF query_embedding IS NULL THEN
    RAISE EXCEPTION 'Query embedding cannot be null';
  END IF;

  IF limit_count IS NULL OR limit_count < 1 THEN
    limit_count := 10;
  END IF;

  RETURN QUERY
  WITH semantic_search AS (
    SELECT
      r.crd_number,
      r.legal_name AS firm_name,
      r.city,
      r.state,
      r.aum,
      0::INTEGER AS employees,
      r.private_fund_count,
      (1 - (n.embedding_vector <=> query_embedding)) AS semantic_score,
      ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) AS semantic_rank
    FROM narratives n
    JOIN ria_profiles r ON r.crd_number = n.crd_number
    WHERE n.embedding_vector IS NOT NULL
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT limit_count * 6
  ),
  fts_search AS (
    SELECT
      r.crd_number,
      r.legal_name AS firm_name,
      r.city,
      r.state,
      r.aum,
      0::INTEGER AS employees,
      r.private_fund_count,
      ts_rank(
        COALESCE(r.fts_document, to_tsvector('english', coalesce(r.legal_name, '') || ' ' || coalesce(r.city, '') || ' ' || coalesce(r.state, ''))),
        plainto_tsquery('english', query_text)
      ) AS fts_score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(
          COALESCE(r.fts_document, to_tsvector('english', coalesce(r.legal_name, '') || ' ' || coalesce(r.city, '') || ' ' || coalesce(r.state, ''))),
          plainto_tsquery('english', query_text)
        ) DESC
      ) AS fts_rank
    FROM ria_profiles r
    WHERE plainto_tsquery('english', query_text) <> ''
      AND COALESCE(r.fts_document, to_tsvector('english', coalesce(r.legal_name, '') || ' ' || coalesce(r.city, '') || ' ' || coalesce(r.state, '')))
          @@ plainto_tsquery('english', query_text)
    LIMIT limit_count * 6
  ),
  fused AS (
    SELECT
      COALESCE(s.crd_number, f.crd_number) AS crd_number,
      COALESCE(s.firm_name, f.firm_name) AS firm_name,
      COALESCE(s.city, f.city) AS city,
      COALESCE(s.state, f.state) AS state,
      COALESCE(s.aum, f.aum) AS aum,
      0::INTEGER AS employees,
      COALESCE(s.private_fund_count, f.private_fund_count) AS private_fund_count,
      COALESCE(s.semantic_score, 0) AS semantic_score,
      COALESCE(f.fts_score, 0) AS fts_score,
      COALESCE(s.semantic_rank, 999999) AS semantic_rank,
      COALESCE(f.fts_rank, 999999) AS fts_rank
    FROM semantic_search s
    FULL OUTER JOIN fts_search f ON f.crd_number = s.crd_number
  ),
  location_normalized AS (
    SELECT
      *,
      coalesce(lower(city), '') AS city_normalized,
      coalesce(lower(state), '') AS state_normalized,
      lower(coalesce(location_city, '')) AS query_city,
      lower(coalesce(location_state, '')) AS query_state
    FROM fused
  ),
  location_filtered AS (
    SELECT
      *,
      CASE
        WHEN location_city IS NULL THEN 1.0
        ELSE GREATEST(
          similarity(city_normalized, query_city),
          CASE WHEN location_state IS NOT NULL THEN similarity(state_normalized, query_state) ELSE 0 END
        )
      END AS location_match_score
    FROM location_normalized
    WHERE
      location_city IS NULL
      OR similarity(city_normalized, query_city) > 0.3
      OR (location_state IS NOT NULL AND similarity(state_normalized, query_state) > 0.3)
  ),
  ranked AS (
    SELECT
      crd_number,
      firm_name,
      city,
      state,
      aum,
      0::INTEGER AS employees,
      private_fund_count,
      semantic_score,
      fts_score,
      location_match_score,
      (semantic_weight / (rrf_k + semantic_rank)) +
      (fts_weight / (rrf_k + fts_rank)) AS combined_rank
    FROM location_filtered
  )
  SELECT
    crd_number,
    firm_name,
    city,
    state,
    aum,
    employees,
    private_fund_count,
    combined_rank,
    semantic_score,
    fts_score,
    COALESCE(location_match_score, 0) AS location_match_score
  FROM ranked
  ORDER BY combined_rank DESC, location_match_score DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION hybrid_search_rias(TEXT, VECTOR(768), TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role, anon;
