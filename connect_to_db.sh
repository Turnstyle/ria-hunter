#!/bin/bash
# Connect to Supabase PostgreSQL database and create HNSW index

# Load environment variables
source .env.local

# Extract the database connection details from SUPABASE_URL
if [[ $SUPABASE_URL =~ https://([^\.]+) ]]; then
  PROJECT_ID=${BASH_REMATCH[1]}
  echo "Project ID: $PROJECT_ID"
  
  # Use PSQL to execute the SQL command with a longer timeout
  PGPASSWORD=$SUPABASE_SERVICE_ROLE_KEY psql \
    -h $PROJECT_ID.supabase.co \
    -p 5432 \
    -d postgres \
    -U postgres \
    -f create_hnsw_index.sql
else
  echo "Could not extract project ID from SUPABASE_URL: $SUPABASE_URL"
  exit 1
fi
