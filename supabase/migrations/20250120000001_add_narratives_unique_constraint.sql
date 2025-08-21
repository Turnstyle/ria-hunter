-- Add unique constraint on crd_number for narratives table to enable upserts
-- This fixes the ON CONFLICT specification error in the data pipeline

-- First, ensure no duplicates exist (cleanup if needed)
DELETE FROM narratives 
WHERE id NOT IN (
  SELECT DISTINCT ON (crd_number) id
  FROM narratives 
  ORDER BY crd_number, created_at DESC
);

-- Add unique constraint on crd_number
ALTER TABLE narratives 
ADD CONSTRAINT narratives_crd_number_unique 
UNIQUE (crd_number);

-- Add comment to document the constraint
COMMENT ON CONSTRAINT narratives_crd_number_unique ON narratives IS 
'Unique constraint on crd_number to enable upsert operations in data pipeline';
