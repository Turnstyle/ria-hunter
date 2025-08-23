# SQL Implementation for Supabase SQL Editor

## 🚨 CRITICAL INSTRUCTIONS

These SQL statements need to be executed in **Supabase SQL Editor** at:
https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql

**Execute them IN ORDER** as separate queries (copy/paste one section at a time).

---

## 1️⃣ APPLY RLS MIGRATION (if not done)

```sql
-- Comprehensive Row Level Security Implementation
-- Based on Final_Refactor_Backend_Plan_v2_22-Aug-2025.md Section 1.5

-- Create missing audit infrastructure tables
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_dead_letter (
    id SERIAL PRIMARY KEY,
    record_data JSONB NOT NULL,
    error_message TEXT,
    error_stage TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create search error logging table
CREATE TABLE IF NOT EXISTS search_errors (
    id SERIAL PRIMARY KEY,
    function_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    query_params JSONB,
    user_id UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 2️⃣ ENABLE RLS ON TABLES

```sql
-- Enable RLS on all core tables
ALTER TABLE ria_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria_private_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_errors ENABLE ROW LEVEL SECURITY;
```

## 3️⃣ CREATE RLS POLICIES

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "anon_read_rias" ON ria_profiles;
DROP POLICY IF EXISTS "auth_read_rias" ON ria_profiles;
DROP POLICY IF EXISTS "service_full_access_ria_profiles" ON ria_profiles;

-- 1. RIA Profiles - Public data, accessible to all
CREATE POLICY "anon_read_rias" ON ria_profiles
    FOR SELECT TO anon USING (true);

CREATE POLICY "auth_read_rias" ON ria_profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_full_access_ria_profiles" ON ria_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## 4️⃣ MORE RLS POLICIES

```sql
-- 2. Narratives - Public data, accessible to all
DROP POLICY IF EXISTS "anon_read_narratives" ON narratives;
DROP POLICY IF EXISTS "auth_read_narratives" ON narratives;
DROP POLICY IF EXISTS "service_full_access_narratives" ON narratives;

CREATE POLICY "anon_read_narratives" ON narratives
    FOR SELECT TO anon USING (true);

CREATE POLICY "auth_read_narratives" ON narratives
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_full_access_narratives" ON narratives
    FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## 5️⃣ CONTROL PERSONS & PRIVATE FUNDS POLICIES

```sql
-- 3. Control Persons - Authenticated users only
DROP POLICY IF EXISTS "anon_no_control_persons" ON control_persons;
DROP POLICY IF EXISTS "auth_read_control_persons" ON control_persons;
DROP POLICY IF EXISTS "service_full_access_control_persons" ON control_persons;

CREATE POLICY "anon_no_control_persons" ON control_persons
    FOR SELECT TO anon USING (false);

CREATE POLICY "auth_read_control_persons" ON control_persons
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_full_access_control_persons" ON control_persons
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Private Funds - Authenticated access
DROP POLICY IF EXISTS "anon_no_private_funds" ON ria_private_funds;
DROP POLICY IF EXISTS "auth_restricted_private_funds" ON ria_private_funds;
DROP POLICY IF EXISTS "service_full_access_private_funds" ON ria_private_funds;

CREATE POLICY "anon_no_private_funds" ON ria_private_funds
    FOR SELECT TO anon USING (false);

CREATE POLICY "auth_restricted_private_funds" ON ria_private_funds
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_full_access_private_funds" ON ria_private_funds
    FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## 6️⃣ AUDIT POLICIES

```sql
-- 5. Audit tables - Restricted access
DROP POLICY IF EXISTS "service_full_access_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "service_only_migration_log" ON migration_log;
DROP POLICY IF EXISTS "service_only_etl_dead_letter" ON etl_dead_letter;
DROP POLICY IF EXISTS "service_full_access_search_errors" ON search_errors;

CREATE POLICY "service_full_access_audit_logs" ON audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_only_migration_log" ON migration_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_only_etl_dead_letter" ON etl_dead_letter
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_access_search_errors" ON search_errors
    FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## 7️⃣ CREATE AUDIT TRIGGER FUNCTION

```sql
-- Create comprehensive audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id UUID;
    audit_ip INET;
BEGIN
    -- Try to get the current user ID from auth context
    BEGIN
        audit_user_id := auth.uid();
    EXCEPTION 
        WHEN OTHERS THEN
            audit_user_id := NULL;
    END;
    
    -- Try to get client IP
    BEGIN
        audit_ip := inet_client_addr();
    EXCEPTION 
        WHEN OTHERS THEN
            audit_ip := NULL;
    END;
    
    INSERT INTO audit_logs (
        table_name,
        operation,
        user_id,
        record_id,
        old_values,
        new_values,
        ip_address,
        created_at
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        audit_user_id,
        COALESCE(CAST((NEW).crd_number AS TEXT), CAST((OLD).crd_number AS TEXT)),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END,
        audit_ip,
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 8️⃣ APPLY AUDIT TRIGGERS

```sql
-- Apply audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_control_persons ON control_persons;
DROP TRIGGER IF EXISTS audit_private_funds ON ria_private_funds;

CREATE TRIGGER audit_control_persons 
    AFTER INSERT OR UPDATE OR DELETE ON control_persons
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_private_funds 
    AFTER INSERT OR UPDATE OR DELETE ON ria_private_funds
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

## 9️⃣ CREATE HNSW INDEX (if not exists)

```sql
-- Create HNSW index for narratives table
CREATE INDEX IF NOT EXISTS narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Create supporting index
CREATE INDEX IF NOT EXISTS narratives_crd_embedding_vector_idx
ON narratives (crd_number)
WHERE embedding_vector IS NOT NULL;

-- Analyze to update statistics
ANALYZE narratives;
```

## 🔟 CORRECTED VECTOR SEARCH FUNCTIONS

```sql
-- Drop old functions
DROP FUNCTION IF EXISTS search_rias(vector, float, integer, jsonb);
DROP FUNCTION IF EXISTS match_narratives(vector, float, integer, text);
DROP FUNCTION IF EXISTS hybrid_search_rias(text, vector, integer, float, float, jsonb, boolean);

-- Create corrected match_narratives function
CREATE OR REPLACE FUNCTION match_narratives(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.75,
    match_count integer DEFAULT 15
)
RETURNS TABLE(
    id uuid,
    narrative_text text,
    similarity_score float,
    crd_number bigint,
    firm_name text
)
LANGUAGE plpgsql 
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.narrative as narrative_text,
        (1 - (n.embedding_vector <=> query_embedding)) as similarity_score,
        n.crd_number,
        r.legal_name as firm_name
    FROM narratives n
    JOIN ria_profiles r ON n.crd_number = r.crd_number
    WHERE n.embedding_vector IS NOT NULL
        AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
    ORDER BY n.embedding_vector <=> query_embedding
    LIMIT match_count;
END;
$$;
```

## 1️⃣1️⃣ PERFORMANCE MONITORING FUNCTION

```sql
-- Create performance monitoring function
CREATE OR REPLACE FUNCTION test_vector_search_performance()
RETURNS TABLE(
    test_name TEXT,
    duration_ms NUMERIC,
    result_count INTEGER,
    status TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    duration_ms NUMERIC;
    test_embedding vector(768);
    result_count INTEGER;
BEGIN
    -- Create a test embedding
    test_embedding := array_fill(0.1, ARRAY[768])::vector(768);
    
    -- Test narratives search
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO result_count
    FROM match_narratives(test_embedding, 0.5, 10);
    
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'narratives_vector_search'::TEXT,
        ROUND(duration_ms, 2),
        result_count,
        CASE 
            WHEN duration_ms < 10 THEN 'EXCELLENT (<10ms)'
            WHEN duration_ms < 100 THEN 'GOOD (<100ms)'
            WHEN duration_ms < 500 THEN 'ACCEPTABLE (<500ms)'
            ELSE 'NEEDS_OPTIMIZATION (>500ms)'
        END;
END;
$$ LANGUAGE plpgsql;
```

## 1️⃣2️⃣ GRANT PERMISSIONS

```sql
-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_narratives TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION test_vector_search_performance TO authenticated, service_role, anon;

-- Log completion
INSERT INTO migration_log (action, status, details) 
VALUES (
    'vector_search_functions_corrected',
    'completed',
    jsonb_build_object(
        'functions_created', ARRAY['match_narratives', 'test_vector_search_performance'],
        'indexes_created', ARRAY['narratives_embedding_vector_hnsw_idx'],
        'timestamp', NOW()
    )
);
```

---

## 🚀 EXECUTION INSTRUCTIONS

1. **Go to Supabase SQL Editor**: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql

2. **Execute each section one at a time** (copy/paste and run)

3. **After completion, let me know** and I'll run the performance tests

4. **Expected results**:
   - RLS policies implemented ✅
   - HNSW index created ✅  
   - Vector search functions working ✅
   - Performance <10ms target ✅

Let me know when you've executed these and I'll run the validation tests!
