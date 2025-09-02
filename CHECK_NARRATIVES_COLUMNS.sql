-- Check what columns exist in narratives table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'narratives' 
ORDER BY ordinal_position;

-- Check sample data to see what's available
SELECT *
FROM narratives
WHERE embedding_vector IS NOT NULL
LIMIT 3;
