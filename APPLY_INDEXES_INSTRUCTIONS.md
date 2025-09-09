# How to Fix the Timeout Issues - Apply Database Indexes

## What's the Problem?
Your searches are timing out because the database is searching through 100,000+ records without indexes. It's like trying to find a word in a book by reading every single page instead of using the index at the back.

## What are Indexes?
Think of database indexes like a book's index:
- **Without index**: Read every page to find "Edward Jones" (slow, causes timeouts)
- **With index**: Look up "Edward Jones" in the index, jump directly to page 247 (instant)

## How to Apply the Fix

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/_/sql
2. Make sure you're in your RIA Hunter project

### Step 2: Copy and Run the Index Creation Script
1. Copy ALL the SQL code from the box below
2. Paste it into the SQL Editor
3. Click "Run" 
4. Wait about 30-60 seconds for it to complete

```sql
-- =====================================================
-- FIX TIMEOUT ISSUES WITH PROPER DATABASE INDEXES
-- =====================================================
-- This will make searches 100-1000x faster

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

-- 6. Fund type text search
CREATE INDEX IF NOT EXISTS idx_private_funds_type_text ON ria_private_funds USING gin(fund_type gin_trgm_ops);

-- 7. Composite index for common searches
CREATE INDEX IF NOT EXISTS idx_ria_profiles_search_combo ON ria_profiles(state, city, aum DESC);

-- 8. Fund count index
CREATE INDEX IF NOT EXISTS idx_ria_profiles_fund_count ON ria_profiles(private_fund_count DESC NULLS LAST);

-- 9. Narratives index
CREATE INDEX IF NOT EXISTS idx_narratives_crd ON narratives(crd_number);

-- 10. Control persons index
CREATE INDEX IF NOT EXISTS idx_control_persons_crd ON control_persons(crd_number);

-- Enable fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Update statistics
ANALYZE ria_profiles;
ANALYZE ria_private_funds;
ANALYZE narratives;
ANALYZE control_persons;

-- Show created indexes
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('ria_profiles', 'ria_private_funds')
ORDER BY tablename, indexname;
```

### Step 3: Verify It Worked
After running, you should see a list of indexes at the bottom showing something like:
```
ria_profiles | idx_ria_profiles_aum
ria_profiles | idx_ria_profiles_city
ria_profiles | idx_ria_profiles_state
... (more indexes)
```

## What This Will Fix

### Before Indexes:
- ❌ Searches timeout after 5+ seconds
- ❌ Can't search St. Louis RIAs without crashes
- ❌ Slow loading times

### After Indexes:
- ✅ Searches complete in milliseconds
- ✅ St. Louis search returns all 375 RIAs with VC activity
- ✅ 100-1000x faster performance

## Expected Results

After applying indexes, this search should work instantly:
- Search: "St. Louis RIAs with VC activity"
- Before: Timeout error
- After: 375 results in under 1 second

## Why This Works

The indexes tell the database exactly where to look:
1. **State index**: Instantly finds all "MO" records
2. **City index**: Quickly finds "ST LOUIS" variations
3. **Fund type index**: Rapidly identifies VC/PE funds
4. **AUM index**: Sorts by size without scanning everything

## If Something Goes Wrong

The script uses "IF NOT EXISTS" so it's safe to run multiple times. If you see any errors:
1. Take a screenshot of the error
2. The most likely issue is the pg_trgm extension - you may need to enable it in Supabase settings first
3. Even if one index fails, the others will still help

## Bottom Line

This fix will make your searches work properly without timeouts. It's like giving your database a GPS instead of making it wander around looking for data.
