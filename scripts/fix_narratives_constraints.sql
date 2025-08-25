-- Fix Narratives Constraints SQL
-- Execute this in the Supabase SQL Editor to resolve the constraint issue

-- Step 1: Create backup of narratives table
CREATE TABLE IF NOT EXISTS narratives_backup AS SELECT * FROM narratives;

-- Step 2: Verify backup was created successfully
SELECT COUNT(*) as backup_count FROM narratives_backup;

-- Step 3: Drop the unique constraint that's causing issues
ALTER TABLE narratives DROP CONSTRAINT IF EXISTS narratives_crd_number_unique;

-- Step 4: Create a more appropriate constraint (optional)
-- This allows multiple narratives per RIA but ensures uniqueness per narrative type
ALTER TABLE narratives ADD CONSTRAINT narratives_crd_narrative_type_unique UNIQUE (crd_number, narrative_type);

-- Step 5: Verify the fix by checking constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'narratives'::regclass::oid;
