# 🚨 URGENT: Database Function Deployment Required

## Current Status
- ✅ **Embeddings**: 8,384+ completed and growing (768-dimensional)  
- ❌ **Search Functions**: Still configured for wrong dimensions
- 🎯 **Next Step**: Deploy corrected functions to enable semantic search

## Required Action
**Copy and paste the following SQL into Supabase SQL Editor:**

```sql
-- Drop existing functions that have wrong dimensions
DROP FUNCTION IF EXISTS search_rias CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_rias CASCADE;
DROP FUNCTION IF EXISTS match_narratives CASCADE;

-- Create corrected search_rias function (768 dimensions)
CREATE OR REPLACE FUNCTION search_rias(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 20,
  state_filter TEXT DEFAULT NULL,
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

-- Create simple match_narratives function (768 dimensions)
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding VECTOR(768),
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_rias TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role;
```

## Steps to Deploy
1. Go to Supabase → Project → SQL Editor
2. Paste the SQL above
3. Click "Run" to execute
4. Verify with: `SELECT * FROM search_rias(ARRAY[0.1]::vector(768), 0.1, 1);`

## Post-Deployment Test
Once deployed, these API endpoints should work:
- `GET /api/v1/ria/query?query=venture+capital&limit=5`
- `POST /api/v1/ria/search` with `{"query": "Missouri firms"}`

**Priority**: HIGH - Semantic search is currently broken without these functions.
