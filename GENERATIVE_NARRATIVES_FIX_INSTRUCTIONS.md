# Fixing the Generative Narratives Process

## Executive Summary

The RIA Hunter's generative narratives process is currently broken due to an issue with how embeddings are stored in the database. Specifically, the embeddings are stored as JSON strings in text columns instead of proper `vector(768)` type, causing the `match_narratives` RPC to fail or timeout when trying to process strings as vectors.

## Step-by-Step Fix Instructions

### 1. Run the SQL Fix Script in Supabase SQL Editor

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Open the `FIX_GENERATIVE_NARRATIVES.sql` file from this project
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click "Run" to execute the script

The script will:
- Check the current state of the embeddings
- Drop any incorrectly typed embedding_vector column
- Create a properly typed vector(768) column
- Convert JSON string embeddings to proper vectors
- Create an HNSW index for fast similarity search
- Update the match_narratives function
- Test that everything works

### 2. Monitor the Conversion Process

The conversion happens in batches to avoid timeouts. You'll see progress notifications in the SQL Editor output:

```
Starting conversion of 76597 narratives with embeddings
Processing batch 1...
Converted 500 of 76597 embeddings (0.7%)...
Processing batch 2...
Converted 1000 of 76597 embeddings (1.3%)...
...
Conversion complete! Total converted: 76597
```

This may take 10-15 minutes to complete, depending on the database size.

### 3. Verify the Fix

After the SQL script completes, you can verify the fix by running:

```bash
node test_generative_narratives.js
```

This will test:
- That vector embeddings exist in the database
- That the match_narratives RPC works
- That the API endpoint returns semantic search results

## What Was Fixed

1. **Database Schema**: Changed embedding storage from JSON strings to proper vector(768) type
2. **Vector Conversion**: Converted existing JSON string embeddings to native vector format
3. **Index Creation**: Created HNSW index for fast vector similarity search 
4. **RPC Function**: Updated match_narratives function to use proper vector operations
5. **Permissions**: Granted proper permissions to the function for all roles

## Expected Results

After applying the fix, you should see:
- The `match_narratives` RPC returns results with proper similarity scores
- The semantic search API returns "semantic-first" strategy (not "structured-fallback")
- Query results are semantically relevant to the query text
- Confidence and similarity scores are displayed correctly

## Troubleshooting

If you encounter issues after running the fix:

1. **Check vector conversion**: Make sure the SQL script completed successfully
2. **Verify embeddings**: Run the test script to verify vector dimensions
3. **Check RPC permissions**: Ensure the function has execute permissions for all roles
4. **Review API logs**: Check for any errors in the API response

If problems persist, check the "SEMANTIC_SEARCH_FIXED_SUMMARY.md" file for additional context on previous fixes.
