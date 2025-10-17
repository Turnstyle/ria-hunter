-- Migration: 20250115_ai_native_search_indexes
-- Purpose: Ensure required extensions, indexes, and generated columns exist for AI-native search

-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Ensure pgvector is present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not found. Enable it before running this migration.';
  END IF;
END $$;

-- HNSW index tuned for Micro tier (1GB RAM)
CREATE INDEX IF NOT EXISTS narratives_embedding_hnsw_idx
ON narratives
USING hnsw (embedding_vector vector_ip_ops)
WITH (m = 16, ef_construction = 40)
WHERE embedding_vector IS NOT NULL;

-- Trigram indexes for fuzzy city/state lookups
CREATE INDEX IF NOT EXISTS ria_profiles_city_trgm_idx
ON ria_profiles USING gin (lower(city) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ria_profiles_state_trgm_idx
ON ria_profiles USING gin (lower(state) gin_trgm_ops);

-- Generated tsvector column for full-text search
ALTER TABLE ria_profiles
ADD COLUMN IF NOT EXISTS fts_document tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(legal_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(state, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS ria_profiles_fts_idx
ON ria_profiles USING gin (fts_document);

-- Refresh planner statistics
ANALYZE ria_profiles;
