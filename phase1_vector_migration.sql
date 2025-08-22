-- Phase 1: Critical Database Infrastructure Migration
-- Convert string embeddings to proper vector(768) type and add missing functions

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Backup current tables (safety first!)
CREATE TABLE IF NOT EXISTS narratives_backup_phase1 AS SELECT * FROM narratives;
CREATE TABLE IF NOT EXISTS ria_profiles_backup_phase1 AS SELECT * FROM ria_profiles;

-- Step 3: Add new vector column to narratives table
ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

-- Step 4: Create function to convert JSON string to vector
CREATE OR REPLACE FUNCTION convert_string_to_vector(embedding_str text)
RETURNS vector(768)
LANGUAGE plpgsql
AS $$
DECLARE
    embedding_array float[];
    result_vector vector(768);
BEGIN
    -- Parse JSON string to array
    SELECT array_agg(value::float) 
    INTO embedding_array
    FROM json_array_elements_text(embedding_str::json) as value;
    
    -- Convert to vector
    result_vector := embedding_array::vector(768);
    
    RETURN result_vector;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Failed to convert embedding: %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Step 5: Batch conversion function (process in chunks to avoid timeouts)
CREATE OR REPLACE FUNCTION migrate_embeddings_to_vector()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    batch_size integer := 1000;
    processed integer := 0;
    total_rows integer;
    current_batch integer := 0;
BEGIN
    -- Get total count
    SELECT COUNT(*) INTO total_rows 
    FROM narratives 
    WHERE embedding IS NOT NULL 
    AND embedding_vector IS NULL;
    
    RAISE NOTICE 'Starting migration of % narratives to vector format', total_rows;
    
    -- Process in batches
    WHILE processed < total_rows LOOP
        current_batch := current_batch + 1;
        
        -- Update batch
        UPDATE narratives 
        SET embedding_vector = convert_string_to_vector(embedding)
        WHERE id IN (
            SELECT id 
            FROM narratives 
            WHERE embedding IS NOT NULL 
            AND embedding_vector IS NULL
            LIMIT batch_size
        );
        
        processed := processed + batch_size;
        
        RAISE NOTICE 'Batch % complete: processed %/% embeddings', 
                    current_batch, LEAST(processed, total_rows), total_rows;
        
        -- Small delay to prevent overwhelming the system
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RAISE NOTICE 'Migration complete! Processed % embeddings', total_rows;
END;
$$;

-- Step 6: Core vector search function
CREATE OR REPLACE FUNCTION search_rias(
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
    state text,
    aum numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.crd_number,
        n.narrative as narrative_text,
        1 - (n.embedding_vector <=> query_embedding) as similarity_score,
        r.legal_name as firm_name,
        r.city,
        r.state,
        r.aum
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
        AND (state_filter IS NULL OR r.state ILIKE state_filter)
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Step 7: Hybrid search function (vector + full-text)
CREATE OR REPLACE FUNCTION hybrid_search_rias(
    query_text text,
    query_embedding vector(768),
    match_count integer DEFAULT 10,
    semantic_weight float DEFAULT 0.7,
    full_text_weight float DEFAULT 0.3,
    state_filter text DEFAULT NULL
)
RETURNS TABLE(
    crd_number bigint,
    narrative_text text,
    combined_score float,
    firm_name text,
    city text,
    state text
)
LANGUAGE plpgsql 
AS $$
BEGIN
    RETURN QUERY
    WITH semantic_results AS (
        SELECT 
            n.crd_number,
            n.narrative as narrative_text,
            r.legal_name as firm_name,
            r.city,
            r.state,
            1 - (n.embedding_vector <=> query_embedding) as score,
            ROW_NUMBER() OVER (ORDER BY n.embedding_vector <=> query_embedding) as rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
            AND (state_filter IS NULL OR r.state ILIKE state_filter)
        LIMIT match_count * 2
    ),
    fulltext_results AS (
        SELECT 
            n.crd_number,
            n.narrative as narrative_text,
            r.legal_name as firm_name,
            r.city,
            r.state,
            ts_rank_cd(
                to_tsvector('english', COALESCE(n.narrative, '') || ' ' || COALESCE(r.legal_name, '')),
                websearch_to_tsquery('english', query_text)
            ) as score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', COALESCE(n.narrative, '') || ' ' || COALESCE(r.legal_name, '')),
                    websearch_to_tsquery('english', query_text)
                ) DESC
            ) as rank
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE to_tsvector('english', COALESCE(n.narrative, '') || ' ' || COALESCE(r.legal_name, ''))
              @@ websearch_to_tsquery('english', query_text)
            AND (state_filter IS NULL OR r.state ILIKE state_filter)
        LIMIT match_count * 2
    )
    SELECT 
        COALESCE(s.crd_number, f.crd_number),
        COALESCE(s.narrative_text, f.narrative_text),
        (semantic_weight / (50 + COALESCE(s.rank, match_count * 2))) +
        (full_text_weight / (50 + COALESCE(f.rank, match_count * 2))) as combined_score,
        COALESCE(s.firm_name, f.firm_name),
        COALESCE(s.city, f.city),
        COALESCE(s.state, f.state)
    FROM semantic_results s
    FULL OUTER JOIN fulltext_results f ON s.crd_number = f.crd_number
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Step 8: Legacy compatibility function (matches existing API)
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
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.crd_number,
        n.narrative,
        1 - (n.embedding_vector <=> query_embedding) as similarity
    FROM narratives n
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Step 9: Grant permissions
GRANT EXECUTE ON FUNCTION convert_string_to_vector TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION search_rias TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search_rias TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION match_narratives TO service_role, authenticated;

-- Note: HNSW indexes will be created after migration completes
-- This is Phase 1a - vector type migration and functions
-- Phase 1b will be index creation after testing
