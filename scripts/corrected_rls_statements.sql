-- Corrected RLS Implementation Based on Actual Schema
-- Execute these statements in Supabase SQL Editor: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql

-- ================================
-- 1. CREATE MISSING AUDIT TABLES
-- ================================

-- migration_log and etl_dead_letter already exist, but let's ensure search_errors exists
CREATE TABLE IF NOT EXISTS search_errors (
    id SERIAL PRIMARY KEY,
    function_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    query_params JSONB,
    user_id UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- 2. CREATE ENHANCED AUDIT TRIGGER
-- ================================

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id UUID;
    record_primary_key TEXT;
BEGIN
    -- Try to get the current user ID
    BEGIN
        audit_user_id := auth.uid();
    EXCEPTION 
        WHEN OTHERS THEN
            audit_user_id := NULL;
    END;
    
    -- Get the appropriate primary key based on table
    record_primary_key := CASE TG_TABLE_NAME
        WHEN 'ria_profiles' THEN COALESCE((NEW).crd_number::TEXT, (OLD).crd_number::TEXT)
        WHEN 'narratives' THEN COALESCE((NEW).id::TEXT, (OLD).id::TEXT)
        WHEN 'control_persons' THEN COALESCE((NEW).control_person_pk::TEXT, (OLD).control_person_pk::TEXT)
        WHEN 'ria_private_funds' THEN COALESCE((NEW).id::TEXT, (OLD).id::TEXT)
        ELSE 'unknown'
    END;
    
    INSERT INTO audit_logs (
        table_name,
        operation,
        user_id,
        record_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        audit_user_id,
        record_primary_key,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) END,
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 3. ENABLE RLS ON ALL TABLES
-- ================================

ALTER TABLE ria_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria_private_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_errors ENABLE ROW LEVEL SECURITY;

-- ================================
-- 4. DROP EXISTING POLICIES (if any)
-- ================================

-- RIA Profiles policies
DROP POLICY IF EXISTS "public read ria_profiles" ON ria_profiles;
DROP POLICY IF EXISTS "admin insert ria_profiles" ON ria_profiles;
DROP POLICY IF EXISTS "admin update ria_profiles" ON ria_profiles;
DROP POLICY IF EXISTS "anon_read_rias" ON ria_profiles;
DROP POLICY IF EXISTS "auth_read_rias" ON ria_profiles;
DROP POLICY IF EXISTS "service_full_access_ria_profiles" ON ria_profiles;

-- Narratives policies
DROP POLICY IF EXISTS "public read narratives" ON narratives;
DROP POLICY IF EXISTS "admin insert narratives" ON narratives;
DROP POLICY IF EXISTS "admin update narratives" ON narratives;

-- Control persons policies
DROP POLICY IF EXISTS "public read control_persons" ON control_persons;

-- Private funds policies
DROP POLICY IF EXISTS "public read ria_private_funds" ON ria_private_funds;

-- ================================
-- 5. CREATE COMPREHENSIVE RLS POLICIES
-- ================================

-- RIA PROFILES - Public data accessible to all
CREATE POLICY "anon_read_rias" ON ria_profiles
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "auth_read_rias" ON ria_profiles
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "service_full_access_ria_profiles" ON ria_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- NARRATIVES - Public data accessible to all
CREATE POLICY "anon_read_narratives" ON narratives
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "auth_read_narratives" ON narratives
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "service_full_access_narratives" ON narratives
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- CONTROL PERSONS - Restricted to authenticated users
CREATE POLICY "anon_no_control_persons" ON control_persons
    FOR SELECT
    TO anon
    USING (false);  -- Anonymous users cannot see control persons

CREATE POLICY "auth_read_control_persons" ON control_persons
    FOR SELECT
    TO authenticated
    USING (
        -- Authenticated users can see control persons
        EXISTS (
            SELECT 1 FROM ria_profiles r
            WHERE r.crd_number = control_persons.crd_number
        )
    );

CREATE POLICY "service_full_access_control_persons" ON control_persons
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RIA PRIVATE FUNDS - Subscription-based access (future)
CREATE POLICY "anon_no_private_funds" ON ria_private_funds
    FOR SELECT
    TO anon
    USING (false);  -- Anonymous users cannot see private funds

CREATE POLICY "auth_private_funds_basic" ON ria_private_funds
    FOR SELECT
    TO authenticated
    USING (
        -- For now, authenticated users can access private funds
        -- TODO: Add subscription tier checking when Stripe is integrated
        true
    );

CREATE POLICY "service_full_access_private_funds" ON ria_private_funds
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- AUDIT LOGS - Restricted access
CREATE POLICY "anon_no_audit_logs" ON audit_logs
    FOR SELECT
    TO anon
    USING (false);

-- Users can only see their own audit logs
CREATE POLICY "auth_own_audit_logs" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "service_full_access_audit_logs" ON audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- MIGRATION LOG - Service role only
CREATE POLICY "service_only_migration_log" ON migration_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ETL DEAD LETTER - Service role only
CREATE POLICY "service_only_etl_dead_letter" ON etl_dead_letter
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- SEARCH ERRORS - Service role only
CREATE POLICY "service_only_search_errors" ON search_errors
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ================================
-- 6. CREATE AUDIT TRIGGERS
-- ================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS audit_control_persons ON control_persons;
DROP TRIGGER IF EXISTS audit_private_funds ON ria_private_funds;
DROP TRIGGER IF EXISTS audit_ria_profiles ON ria_profiles;

-- Create audit triggers for sensitive tables
CREATE TRIGGER audit_control_persons 
    AFTER INSERT OR UPDATE OR DELETE ON control_persons
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_private_funds 
    AFTER INSERT OR UPDATE OR DELETE ON ria_private_funds
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Audit trigger for significant profile changes
CREATE TRIGGER audit_ria_profiles 
    AFTER UPDATE ON ria_profiles
    FOR EACH ROW 
    WHEN (OLD.legal_name IS DISTINCT FROM NEW.legal_name OR 
          OLD.aum IS DISTINCT FROM NEW.aum OR
          OLD.state IS DISTINCT FROM NEW.state OR
          OLD.city IS DISTINCT FROM NEW.city)
    EXECUTE FUNCTION audit_trigger();

-- ================================
-- 7. CREATE UTILITY FUNCTIONS
-- ================================

-- Function to check user subscription level (placeholder for future Stripe integration)
CREATE OR REPLACE FUNCTION get_user_subscription_tier()
RETURNS TEXT AS $$
BEGIN
    -- For now, return 'basic' for all users
    -- This will be enhanced when Stripe integration is complete
    RETURN 'basic';
    
    -- Future implementation:
    -- RETURN COALESCE(
    --     (auth.jwt() -> 'user_metadata' ->> 'subscription_tier')::text,
    --     'basic'
    -- );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access private funds
CREATE OR REPLACE FUNCTION can_access_private_funds()
RETURNS BOOLEAN AS $$
BEGIN
    -- For now, authenticated users can access private funds
    RETURN auth.uid() IS NOT NULL;
    
    -- Future implementation with subscription tiers:
    -- RETURN get_user_subscription_tier() IN ('pro', 'enterprise');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- 8. LOG COMPLETION
-- ================================

-- Insert completion record into migration log
INSERT INTO migration_log (action, status, details) 
VALUES (
    'comprehensive_rls_corrected_implementation',
    'completed',
    jsonb_build_object(
        'version', '2.0_corrected',
        'tables_secured', ARRAY['ria_profiles', 'narratives', 'control_persons', 'ria_private_funds', 'audit_logs'],
        'schema_corrections', jsonb_build_object(
            'ria_profiles_pk', 'crd_number',
            'control_persons_pk', 'control_person_pk',
            'narratives_pk', 'id',
            'ria_private_funds_pk', 'id'
        ),
        'policies_created', 16,
        'triggers_created', 3,
        'implemented_at', NOW()
    )
);

-- ================================
-- COMPLETION MESSAGE
-- ================================

DO $$
BEGIN
    RAISE NOTICE 'RLS Implementation Complete! ✅';
    RAISE NOTICE 'Tables secured: ria_profiles, narratives, control_persons, ria_private_funds';
    RAISE NOTICE 'Audit logging enabled for sensitive operations';
    RAISE NOTICE 'Ready for Phase 2: ETL Pipeline Implementation';
END $$;
