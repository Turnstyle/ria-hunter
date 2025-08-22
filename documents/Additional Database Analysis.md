# Additional Database Analysis for Master AI Agent

## 1. Migration Audit

An examination of the migration status reveals significant issues:

- The Supabase project does not have a `migrations` table to track applied migrations
- All 23 migration files in the `supabase/migrations` directory exist, but there's no way to verify which ones have been applied
- Critical functions defined in migration files are missing from the database:
  - `match_narratives`: Not found
  - `search_rias_by_narrative`: Not found
  - `search_rias`: Not found
  - `hybrid_search_rias`: Not found
  - `compute_vc_activity`: Returns error about mismatched structure

**Conclusion**: It appears that either (1) migrations were never properly applied, (2) they were applied but the functions were subsequently dropped, or (3) the functions were created in a different schema than `public`. The lack of a migrations tracking table suggests migrations were handled manually rather than through the Supabase CLI.

## 2. Function Deployment

When attempting to run the vector search functions, the following errors occur:

- `match_narratives`: "Could not find the function public.match_narratives without parameters in the schema cache"
- `search_rias`: "Could not find the function public.search_rias without parameters in the schema cache"
- `hybrid_search_rias`: "Could not find the function public.hybrid_search_rias without parameters in the schema cache"
- `compute_vc_activity`: "structure of query does not match function result type"

The migration file `20250805000000_add_vector_similarity_search.sql` defines these functions, but they don't exist in the database. There's no evidence they exist in different schemas either.

The `compute_vc_activity` function exists but returns an error about mismatched result structure, indicating it may have been created with a different signature than what the code is expecting.

## 3. ETL Logs

The ETL process for loading data appears to be fragmented across multiple scripts:

- `load_ria_profiles_all.ts`: Main script for loading RIA profiles from CSV files
- Other scripts like `load_to_supabase_*.py` handle different aspects of data loading

Analysis of the loading scripts reveals:

1. The RIA profile loading process converts CRD numbers to numbers, strips non-numeric characters, and assigns synthetic CRDs starting at 900000 for rows with missing CRDs
2. AUM values are processed by removing commas and converting to numbers
3. Error handling is minimal, with errors logged but processing continuing

No specific error logs were found for private fund and control person processing, but the code shows a pattern of loading only the core RIA data while neglecting related entities.

## 4. AUM Anomalies

Analysis of AUM values in the database reveals:

- 21,410 RIA profiles (20.7%) have NULL AUM values
- 5,994 RIA profiles (5.8%) have zero AUM values
- 74,795 profiles (72.2%) have AUM between $1 and $1M
- 475 profiles (0.5%) have AUM between $1M and $10M
- 128 profiles (0.1%) have AUM between $10M and $100M
- 550 profiles (0.5%) have AUM between $100M and $1B
- 268 profiles (0.3%) have AUM over $1B

Sample profiles with zero AUM include:
```json
{
  "crd_number": 167,
  "legal_name": "MISSION INVESTMENT ADVISORS LLC",
  "city": "SAN FRANCISCO",
  "state": "CA",
  "aum": 0,
  "form_adv_date": "2025-08-04",
  "private_fund_count": 2,
  "private_fund_aum": 2168399000,
  "last_private_fund_analysis": "2025-08-05"
}
```

This example shows inconsistency: the main `aum` field is zero, but `private_fund_aum` shows over $2 billion. This suggests the AUM values were not properly aggregated or updated after loading private fund data.

The top AUM values also show data quality issues, with legal names displayed as "N" and unrealistically large AUM values (the top value is $4.7 quadrillion).

## 5. Narrative Generation Status

The narrative generation status shows:

- 103,620 total RIA profiles in the database
- 41,303 narratives generated (39.86% of profiles)
- 62,317 profiles missing narratives (60.14%)
- All narratives have embeddings (no NULL values in the embedding column)

The narrative creation dates indicate all narratives were generated in a single batch:
- First narrative created: 8/21/2025, 1:39:00 AM
- Last narrative created: 8/21/2025, 2:21:50 AM (just 42 minutes later)

This suggests the narrative generation process was:
1. Started on August 21, 2025
2. Ran for about 42 minutes
3. Stopped or was interrupted before completing all profiles
4. Never resumed to complete the remaining 60% of profiles

## 6. Embedding Storage

The embedding vectors are stored as JSON strings rather than native pgvector types:

```
Embedding format:
- Type: string
- Parsed to array: true
- Dimensions: 768
```

To convert the JSON-stored embeddings to native pgvector columns:

1. Create a temporary column with the proper vector type
2. Convert the JSON strings to vector arrays
3. Copy the converted data to the temporary column
4. Drop the original column and rename the temporary one

A SQL migration to do this might look like:

```sql
-- Add temporary column with vector type
ALTER TABLE narratives ADD COLUMN embedding_native vector(768);

-- Convert and copy data (row by row or in batches)
UPDATE narratives 
SET embedding_native = embedding::vector(768);

-- Replace old column with new one
ALTER TABLE narratives DROP COLUMN embedding;
ALTER TABLE narratives RENAME COLUMN embedding_native TO embedding;
```

The performance impact of storing embeddings as JSON strings is significant:
- Native vector types allow hardware-accelerated similarity calculations
- JSON strings must be parsed into arrays at query time
- Index operations are slower and less efficient
- The cosine similarity operator `<=>` doesn't work directly on JSON

## 7. HNSW Index Creation

There's an IVFFLAT index defined in the migration file but no evidence it was created:

```sql
create index if not exists narratives_embedding_idx 
on narratives using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
```

To create the HNSW index (which is generally faster than IVFFLAT for semantic search):

1. Ensure the embeddings are stored as native vector type
2. Run a migration like:

```sql
-- Drop existing index if it exists
DROP INDEX IF EXISTS narratives_embedding_idx;

-- Create HNSW index
CREATE INDEX narratives_embedding_hnsw_idx
ON narratives
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Parameters to consider:
- `m`: Maximum number of connections per node (16 is a good default)
- `ef_construction`: Higher values build more accurate indexes but take longer (64-128 is a good range)

## 8. Raw vs Processed Counts by Month

Analysis of raw data files versus processed database records:

| Data Type | Raw Data Count | Database Count | % Processed |
|-----------|----------------|----------------|-------------|
| RIAs | 94,819 | 103,620 | 109.28% |
| Control Persons | 332,881 | 1,457 | 0.44% |
| Private Funds | 2,451,726 | 292 | 0.01% |

The fact that the database has more RIA profiles than the raw data suggests:
1. Some profiles were created synthetically or from another source
2. There may be duplicate profiles in the database
3. The CRD number deduplication during loading may not be working correctly

The extremely low processing rates for control persons (0.44%) and private funds (0.01%) clearly show that these related entities were not properly processed.

## 9. Data Quality Checks

Several data quality issues are evident:

1. **CRD Number Inconsistencies**:
   - The loading code generates synthetic CRD numbers (starting at 900000) for rows missing CRDs
   - Some CRD numbers are treated as strings in raw data but stored as numbers in the database
   - This can cause issues with joins and foreign key relationships

2. **AUM Value Anomalies**:
   - Unrealistically large AUM values (in the quadrillions)
   - Inconsistencies between main AUM and private fund AUM
   - 26.5% of profiles have NULL or zero AUM values

3. **Missing Legal Names**:
   - Many top AUM profiles have "N" as the legal name
   - This suggests data quality issues in the raw files or parsing errors

4. **Duplicate Profiles**:
   - The processed RIA count exceeds the raw count by 9.28%
   - This indicates potential duplicates or synthetic profiles

5. **Private Fund Disconnection**:
   - Profiles with private funds often have zero main AUM
   - This suggests the values weren't properly aggregated

## 10. Subscription Pipeline

The subscription system is implemented but appears unused:

1. **Subscription Table Structure**:
   - Tracks user subscriptions with Stripe integration
   - Fields include: user_id, status, stripe_customer_id, stripe_subscription_id, current_period_end

2. **Query Tracking Tables**:
   - `user_queries`: Records each search query made by a user
   - `user_shares`: Records when users share search results

3. **Credit System Logic**:
   - Free users get 5 base queries per month (`FREE_BASE_QUERIES = 5`)
   - Each share grants 1 additional query up to 5 bonus queries (`SHARE_BONUS_QUERIES = 1`, `MAX_SHARE_BONUS = 5`)
   - Anonymous users get only 2 queries (`ANON_QUERY_LIMIT = 2`)
   - Subscribers get unlimited queries

4. **Database Write Paths**:
   - `logQueryUsage()` function inserts a record into `user_queries` after each query
   - `supabaseAdmin.from('user_queries').insert([{ user_id: userId }])`
   - Anonymous usage is tracked via cookies, not in the database

5. **Subscription Status**:
   - Active subscriptions have status 'trialing' or 'active'
   - Integration with Stripe API to get additional subscription details

The code paths for the subscription system are implemented and appear sound, but the tables remain empty, suggesting:
1. The application has not yet been used by real users
2. The Stripe integration may not be fully configured
3. The feature may be disabled or bypassed in the current deployment

## Recommendations to Fix Function Deployment Issues

1. **Reinstall pgvector Extension**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Reapply Vector Search Functions**:
   ```sql
   -- Create match_narratives function
   CREATE OR REPLACE FUNCTION match_narratives (
     query_embedding vector(768),
     match_threshold float,
     match_count int
   )
   RETURNS TABLE (
     crd_number text,
     narrative text,
     similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RETURN QUERY
     SELECT
       narratives.crd_number::text,
       narratives.narrative,
       1 - (narratives.embedding::vector(768) <=> query_embedding) AS similarity
     FROM narratives
     WHERE narratives.embedding IS NOT NULL
       AND 1 - (narratives.embedding::vector(768) <=> query_embedding) > match_threshold
     ORDER BY narratives.embedding::vector(768) <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   
   -- Create search_rias function
   CREATE OR REPLACE FUNCTION search_rias (
     query_embedding vector(768),
     match_threshold float DEFAULT 0.5,
     match_count int DEFAULT 20,
     state_filter text DEFAULT NULL,
     min_aum numeric DEFAULT 0
   )
   RETURNS TABLE (
     crd_number bigint,
     legal_name text,
     city text,
     state text,
     aum numeric,
     similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RETURN QUERY
     SELECT
       r.crd_number,
       r.legal_name,
       r.city,
       r.state,
       r.aum,
       1 - (n.embedding::vector(768) <=> query_embedding) AS similarity
     FROM narratives n
     JOIN ria_profiles r ON n.crd_number::bigint = r.crd_number
     WHERE n.embedding IS NOT NULL
       AND 1 - (n.embedding::vector(768) <=> query_embedding) > match_threshold
       AND (state_filter IS NULL OR r.state = state_filter)
       AND r.aum >= min_aum
     ORDER BY n.embedding::vector(768) <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   
   -- Create hybrid_search_rias function
   CREATE OR REPLACE FUNCTION hybrid_search_rias (
     query_text text,
     query_embedding vector(768),
     match_threshold float DEFAULT 0.5,
     match_count int DEFAULT 20,
     state_filter text DEFAULT NULL,
     min_vc_activity int DEFAULT 0,
     min_aum numeric DEFAULT 0
   )
   RETURNS TABLE (
     crd_number bigint,
     legal_name text,
     city text,
     state text,
     aum numeric,
     similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RETURN QUERY
     SELECT
       r.crd_number,
       r.legal_name,
       r.city,
       r.state,
       r.aum,
       1 - (n.embedding::vector(768) <=> query_embedding) AS similarity
     FROM narratives n
     JOIN ria_profiles r ON n.crd_number::bigint = r.crd_number
     WHERE n.embedding IS NOT NULL
       AND 1 - (n.embedding::vector(768) <=> query_embedding) > match_threshold
       AND (state_filter IS NULL OR r.state = state_filter)
       AND r.aum >= min_aum
       AND (
         r.private_fund_count >= min_vc_activity OR
         n.narrative ILIKE '%' || query_text || '%'
       )
     ORDER BY n.embedding::vector(768) <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   ```

3. **Create HNSW Index**:
   ```sql
   CREATE INDEX IF NOT EXISTS narratives_embedding_hnsw_idx
   ON narratives
   USING hnsw (embedding::vector(768) vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```
