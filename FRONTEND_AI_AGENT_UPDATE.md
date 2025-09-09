# URGENT: Backend Fix for Location Filtering Bug

## Status: 🔧 FIX READY TO DEPLOY

**Date**: February 9, 2025  
**Issue**: Location-based queries returning wrong results  
**Root Cause**: Database functions filtering AFTER search instead of DURING

---

## The Problem

Query: **"10 largest RIAs in St. Louis"**  
Expected: St. Louis, MO results  
Actual: San Francisco, London, etc.

### Root Cause Identified
The `hybrid_search_rias` RPC function had a critical design flaw:
1. Semantic search gets top 60 results globally (no location filter)
2. Text search gets top 60 results globally (no location filter)  
3. Combines them
4. THEN applies Missouri filter → If top 60 are all from California, you get ZERO Missouri results!

---

## The Solution

**Apply location filters DURING the search, not AFTER.**

### Migration Ready
File: `supabase/migrations/20250209_fix_location_filtering_properly.sql`

This migration:
- ✅ Fixes `hybrid_search_rias` to filter by state during semantic search
- ✅ Fixes `search_rias` to filter by state during vector search
- ✅ Ensures location queries return location-specific results

---

## Deployment Instructions [[memory:6637617]]

### Step 1: Apply the Migration

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql

2. Copy and paste this SQL:

```sql
-- Copy the entire contents of:
-- supabase/migrations/20250209_fix_location_filtering_properly.sql
```

3. Click **"Run"** to execute

### Step 2: Verify the Fix

Run this test query in the SQL editor:

```sql
-- Test St. Louis query
SELECT * FROM hybrid_search_rias(
    'largest investment advisors',
    (SELECT embedding_proper FROM narratives WHERE embedding_proper IS NOT NULL LIMIT 1),
    0.3,  -- threshold
    10,   -- count
    'MO', -- state filter
    0,    -- min_vc
    0     -- min_aum
);
```

Should return Missouri RIAs including:
- STIFEL, NICOLAUS & COMPANY ($54B AUM)
- EDWARD JONES ($5B AUM)

---

## Expected Results After Fix

```javascript
// Query: "10 largest RIAs in St. Louis"
{
  results: [
    {
      legal_name: "STIFEL, NICOLAUS & COMPANY",
      city: "ST LOUIS",
      state: "MO",
      aum: 54000000000
    },
    {
      legal_name: "EDWARD JONES",
      city: "ST. LOUIS", 
      state: "MO",
      aum: 5086856000
    }
    // ... more St. Louis results
  ]
}
```

---

## Timeline
- **Issue discovered**: 5+ minute hang on location queries
- **Root cause found**: RPC functions filtering incorrectly
- **Fix created**: Ready to deploy
- **Deployment time**: < 1 minute

**No frontend changes needed!** The `/api/ask` endpoint will work correctly once this database fix is applied.