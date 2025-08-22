# Phase 1: Vector Migration Instructions

## Current State
- ✅ 41,303 narratives with 768-dimensional embeddings stored as JSON strings
- ❌ Need to convert to proper PostgreSQL vector(768) type
- ❌ Missing vector search functions
- ❌ Missing HNSW indexes

## Step 1: Run SQL Migration in Supabase

**Instructions:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the SQL below
3. Click "Run" to execute

**SQL to Execute:**

```sql
-- Phase 1a: Enable vector extension and add columns
CREATE EXTENSION IF NOT EXISTS vector;

-- Create backup (safety first!)
CREATE TABLE IF NOT EXISTS narratives_backup_phase1_20250122 AS 
SELECT * FROM narratives LIMIT 0;

INSERT INTO narratives_backup_phase1_20250122 
SELECT * FROM narratives LIMIT 1000; -- Sample backup

-- Add vector column
ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

-- Create conversion function
CREATE OR REPLACE FUNCTION convert_json_to_vector(json_str text)
RETURNS vector(768)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN json_str::json::text::vector(768);
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Convert first batch (1000 records) as test
UPDATE narratives 
SET embedding_vector = convert_json_to_vector(embedding)
WHERE embedding_vector IS NULL 
AND embedding IS NOT NULL
AND id IN (
    SELECT id FROM narratives 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL 
    LIMIT 1000
);

-- Check conversion success
SELECT 
    COUNT(*) as total_with_string_embedding,
    COUNT(embedding_vector) as converted_to_vector,
    ROUND(COUNT(embedding_vector)::decimal / COUNT(*) * 100, 2) as success_rate_percent
FROM narratives 
WHERE embedding IS NOT NULL;
```

## Step 2: Full Batch Conversion

After confirming the test batch works, run this to convert all embeddings:

```sql
-- Convert all remaining embeddings in batches
DO $$
DECLARE
    batch_size INTEGER := 5000;
    total_processed INTEGER := 0;
    batch_count INTEGER;
BEGIN
    LOOP
        -- Update next batch
        UPDATE narratives 
        SET embedding_vector = convert_json_to_vector(embedding)
        WHERE id IN (
            SELECT id 
            FROM narratives 
            WHERE embedding IS NOT NULL 
            AND embedding_vector IS NULL
            LIMIT batch_size
        );
        
        GET DIAGNOSTICS batch_count = ROW_COUNT;
        
        IF batch_count = 0 THEN
            EXIT; -- No more rows to process
        END IF;
        
        total_processed := total_processed + batch_count;
        
        RAISE NOTICE 'Processed % embeddings (batch of %)', total_processed, batch_count;
        
        -- Small pause between batches
        PERFORM pg_sleep(0.5);
    END LOOP;
    
    RAISE NOTICE 'Conversion complete! Total processed: %', total_processed;
END $$;
```

## Step 3: Create Vector Search Functions

```sql
-- Core vector search function
CREATE OR REPLACE FUNCTION search_rias_vector(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 10,
    state_filter text DEFAULT NULL
)
RETURNS TABLE(
    crd_number bigint,
    narrative_text text,
    similarity_score float,
    firm_name text,
    city text,
    state text
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        n.crd_number,
        n.narrative as narrative_text,
        1 - (n.embedding_vector <=> query_embedding) as similarity_score,
        r.legal_name as firm_name,
        r.city,
        r.state
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
        AND (state_filter IS NULL OR r.state ILIKE state_filter)
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
$$;

-- Legacy compatibility function (for existing API)
CREATE OR REPLACE FUNCTION match_narratives(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 10
)
RETURNS TABLE(
    crd_number bigint,
    narrative text,
    similarity float
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        crd_number,
        narrative,
        1 - (embedding_vector <=> query_embedding) as similarity
    FROM narratives
    WHERE embedding_vector IS NOT NULL
        AND (1 - (embedding_vector <=> query_embedding)) > match_threshold
    ORDER BY embedding_vector <=> query_embedding
    LIMIT match_count;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_rias_vector TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_narratives TO anon, authenticated, service_role;
```

## Step 4: Create HNSW Indexes (Phase 1b)

**After conversion is complete**, run this to create high-performance indexes:

```sql
-- Create HNSW index for ultra-fast vector search
CREATE INDEX CONCURRENTLY IF NOT EXISTS narratives_embedding_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Create additional indexes for filtered searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS narratives_crd_embedding_idx
ON narratives (crd_number)
WHERE embedding_vector IS NOT NULL;

-- Full-text search index for hybrid queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS narratives_fulltext_idx
ON narratives 
USING gin(to_tsvector('english', narrative))
WHERE embedding_vector IS NOT NULL;
```

## Verification Queries

Run these to verify the migration:

```sql
-- Check conversion success
SELECT 
    COUNT(*) as total_narratives,
    COUNT(embedding) as string_embeddings,
    COUNT(embedding_vector) as vector_embeddings,
    ROUND(COUNT(embedding_vector)::decimal / COUNT(embedding) * 100, 2) as conversion_rate
FROM narratives;

-- Test vector search
SELECT * FROM match_narratives(
    (SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1),
    0.7,
    5
);

-- Check index creation
SELECT schemaname, tablename, indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'narratives' 
AND indexname LIKE '%embedding%';
```

## Expected Results
- ✅ 41,303 embeddings converted to vector(768) type
- ✅ Vector search functions available
- ✅ HNSW indexes created for <10ms query times
- ✅ Backward compatibility maintained

## Next Steps After Completion
1. Test API endpoints with new vector functions
2. Begin Phase 2: ETL Pipeline for missing narratives
3. Monitor query performance improvements
