#!/bin/bash
# Script to create HNSW index for vector search in Supabase

# Load environment variables from .env.local
source .env.local

# Extract the project ID from SUPABASE_URL
PROJECT_ID=$(echo $SUPABASE_URL | grep -o '[a-z0-9]*\.supabase\.co' | cut -d. -f1)
echo "Project ID: $PROJECT_ID"

# Create a temporary SQL file
cat > create_index.sql << EOL
-- Set a longer statement timeout (10 minutes)
SET statement_timeout = '600000';

-- Create HNSW index for ultra-fast vector search
CREATE INDEX IF NOT EXISTS narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 200);

-- Add performance tuning parameters
ALTER INDEX narratives_embedding_vector_hnsw_idx 
SET (ef_search = 100);

-- Create supporting index for filtered vector searches
CREATE INDEX IF NOT EXISTS narratives_crd_embedding_vector_idx
ON narratives (crd_number)
WHERE embedding_vector IS NOT NULL;

-- Analyze to update planner statistics
ANALYZE narratives;

-- Test the new index
EXPLAIN ANALYZE
SELECT * FROM narratives
WHERE embedding_vector IS NOT NULL
ORDER BY embedding_vector <=> (
  SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1
)
LIMIT 5;
EOL

# Run the SQL command using psql
echo "Connecting to Supabase PostgreSQL database..."
PGPASSWORD=$SUPABASE_SERVICE_ROLE_KEY psql \
  -h "$PROJECT_ID.supabase.co" \
  -p 5432 \
  -d postgres \
  -U postgres \
  -f create_index.sql

# Remove the temporary SQL file
rm create_index.sql

echo "Index creation completed!"
