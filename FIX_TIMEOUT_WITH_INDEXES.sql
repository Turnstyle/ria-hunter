-- =====================================================
-- FIX TIMEOUT ISSUES WITH PROPER DATABASE INDEXES
-- =====================================================
-- This will make searches 100-1000x faster and eliminate timeouts
-- Run this in Supabase SQL Editor

-- 1. Geographic indexes (for city/state searches)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_state ON ria_profiles(state);
CREATE INDEX IF NOT EXISTS idx_ria_profiles_city ON ria_profiles(city);
CREATE INDEX IF NOT EXISTS idx_ria_profiles_state_city ON ria_profiles(state, city);

-- 2. Text search indexes (for city variations like ST LOUIS)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_city_text ON ria_profiles USING gin(city gin_trgm_ops);

-- 3. AUM index (for sorting and filtering)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_aum ON ria_profiles(aum DESC NULLS LAST);

-- 4. CRD number index (for lookups and joins)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_crd ON ria_profiles(crd_number);

-- 5. Private funds indexes (for VC/PE filtering)
CREATE INDEX IF NOT EXISTS idx_private_funds_crd ON ria_private_funds(crd_number);
CREATE INDEX IF NOT EXISTS idx_private_funds_type ON ria_private_funds(fund_type);
CREATE INDEX IF NOT EXISTS idx_private_funds_crd_type ON ria_private_funds(crd_number, fund_type);

-- 6. Fund type text search (for variations like "Venture Capital" vs "VC")
CREATE INDEX IF NOT EXISTS idx_private_funds_type_text ON ria_private_funds USING gin(fund_type gin_trgm_ops);

-- 7. Composite index for common query pattern (state + city + AUM)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_search_combo ON ria_profiles(state, city, aum DESC);

-- 8. Private fund count index (for filtering)
CREATE INDEX IF NOT EXISTS idx_ria_profiles_fund_count ON ria_profiles(private_fund_count DESC NULLS LAST);

-- 9. Narratives index (if we need to join them)
CREATE INDEX IF NOT EXISTS idx_narratives_crd ON narratives(crd_number);

-- 10. Control persons index (if we need to join them)
CREATE INDEX IF NOT EXISTS idx_control_persons_crd ON control_persons(crd_number);

-- Enable pg_trgm extension for fuzzy text matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Analyze tables to update statistics for query planner
ANALYZE ria_profiles;
ANALYZE ria_private_funds;
ANALYZE narratives;
ANALYZE control_persons;

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('ria_profiles', 'ria_private_funds', 'narratives', 'control_persons')
ORDER BY tablename, indexname;
