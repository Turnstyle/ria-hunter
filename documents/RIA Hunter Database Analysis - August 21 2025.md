# RIA Hunter Database Analysis - August 21, 2025

## Executive Summary

This analysis provides a comprehensive review of the RIA Hunter database, focusing on data quality, completeness, and functionality issues. The database contains significant SEC ADV filing data, but with critical gaps in processing and functionality that are affecting the application's core features.

Key findings:
1. **Migration failures**: Critical database functions for vector search are missing despite being defined in migration files
2. **Data processing gaps**: While 103,620 RIA profiles exist, related entities like private funds (0.01%) and control persons (0.44%) are severely under-processed
3. **Data quality issues**: 26.45% of RIA profiles have missing AUM values; many have unrealistic values
4. **Incomplete narrative generation**: 60.14% of profiles lack narratives, limiting semantic search capabilities
5. **Infrastructure issues**: pgvector extension may not be properly installed, and vector search functions are missing

## 1. Migration Tracking

There is no `pgmigrations` or similar tracking table in the database to track which migrations have been applied. All 23 migration files exist in the codebase, but there's no way to verify which ones have been executed:

```
Found 23 migration files in the filesystem
Migration files:
- 20250115000000_add_cik_column_to_ria_profiles.sql
- 20250120000000_reset_narratives_vector_768.sql
- ...
- 20250814094500_fix_compute_vc_signature.sql
```

When testing migration execution permissions, the command fails with:
```
Error executing test migration: Could not find the function public.exec_sql(sql) in the schema cache
```

This suggests migrations are either being managed manually or through a different process than the standard Supabase CLI.

## 2. Function Discovery

The key vector search functions are missing from the database:

```
- match_narratives: Not found in any schema
- search_rias: Not found in any schema
- hybrid_search_rias: Not found in any schema
- compute_vc_activity: Exists but parameters don't match (structure of query does not match function result type)
- search_rias_by_narrative: Not found in any schema
- match_documents: Not found in any schema
```

Only `compute_vc_activity` exists but returns parameter mismatch errors, indicating it was either created with a different signature than what the code expects, or was corrupted during creation.

When checking for the pgvector extension:
```
Error checking vector support: Could not find the function public.check_vector_support without parameters in the schema cache
```

This suggests pgvector may not be properly installed, which would explain why the vector search functions are missing or non-functional.

## 3. Duplicate CRD Numbers

The `crd_number` field in `ria_profiles` appears to be unique with no duplicates found in the sampled data:

```
Total profiles: 1000
Distinct CRD numbers: 1000
Duplicate CRD numbers: 0
```

The `crd_number` field serves as the primary key, which we confirmed by attempting to insert a duplicate:

```
crd_number appears to be the primary key (unique constraint violation)
```

All examined CRDs are regular (non-synthetic) numbers:
```
- Regular CRDs (< 900000): 1000 (100.00%)
- Synthetic CRDs (≥ 900000): 0 (0.00%)
```

This suggests that the CRD number handling is working correctly, at least for the data that has been processed.

## 4. AUM Distribution

The analysis of AUM values reveals significant data quality issues:

```
RIA Profiles AUM Statistics:
- Min: $0
- Max: $959,043,331,864
- Mean: $1,732,339,334.027
- Median: $1,234

AUM Anomalies:
- NULL AUM values: 49 (4.90%)
- Zero AUM values: 99 (9.90%)
- Negative AUM values: 0 (0.00%)
- ≥ $1 trillion AUM values: 0 (0.00%)

AUM Distribution:
- $0: 99 (9.90%)
- $1 - $1M: 626 (62.60%)
- $1M - $10M: 66 (6.60%)
- $10M - $100M: 30 (3.00%)
- $100M - $1B: 86 (8.60%)
- $1B - $1T: 44 (4.40%)
- ≥ $1T: 0 (0.00%)
```

The median AUM of just $1,234 while the mean is $1.7 billion indicates extreme outliers. 

For private funds, the statistics are more reasonable but still show a wide range:
```
Private Funds AUM Statistics:
- Min: $0
- Max: $1,230,002,961
- Mean: $255,329,848.825
- Median: $133,636,179.5
```

The large gap between median and mean for RIA profiles suggests possible data quality issues in the main AUM field.

## 5. Narrative Job Logs

The narrative generation was completed in a single batch on August 21, 2025:

```
First narrative created: 8/21/2025, 1:39:00 AM
Last narrative created: 8/21/2025, 2:21:50 AM
Total duration: 42 minutes, 49 seconds
Total narratives: 41,303
Processing rate: 964.48 narratives per minute
```

The distribution shows all narratives were created during hours 1 and 2 (1:00-2:59 AM):
```
Narrative creation distribution by hour:
- Hour 1: 382 narratives
- Hour 2: 618 narratives
```

The embedding logs show the process was working successfully during the batch:
```
=== Batch 1 ===
✅ Embedded narrative for CRD 1870 (49/50)
✅ SUCCESS! Model: text-embedding-005, Dimensions: 768
✅ Embedded narrative for CRD 1871 (50/50)
❌ Errors: 0
🚀 SUCCESS! Vertex AI embedding generation is working!
```

Given the processing rate of ~964 narratives per minute, the remaining 62,317 narratives would take approximately 65 more minutes to complete. The process appears to have stopped after the initial 42-minute run.

## 6. Missing-Field Audit

The audit of missing fields in `ria_profiles` reveals widespread data quality issues:

```
Missing field counts:
- legal_name: 15,295 (14.76%) missing
  • NULL: 15,295
- city: 26,468 (25.54%) missing
  • NULL: 20,421
  • Empty string: 6,047
- state: 30,466 (29.40%) missing
  • NULL: 24,419
  • Empty string: 6,047
- aum: 27,404 (26.45%) missing
  • NULL: 21,410
  • Zero: 5,994
- phone: 86,968 (83.93%) missing
  • NULL: 86,968
- website: 103,519 (99.90%) missing
  • NULL: 103,519
- fax: 95,141 (91.82%) missing
  • NULL: 95,141
- cik: 103,620 (100.00%) missing
  • NULL: 103,620
- form_adv_date: 21,341 (20.60%) missing
  • NULL: 21,341
```

Several critical issues are evident:
1. **Contact information is largely missing**: 83.93% missing phone numbers, 99.90% missing websites
2. **CIK field is completely empty**: 100% missing, despite a migration to add this field
3. **Core location data has gaps**: ~30% missing city or state information
4. **AUM data is incomplete**: 26.45% have NULL or zero AUM values

Sample profiles show the extent of the issue:
```
Incomplete Profile 1 (CRD: 286381):
  crd_number: 286381
  legal_name: N
  city: WESTERVILLE
  state: OH
  aum: 199400000
  phone: (614) 306-1630
  website: NULL
```

Even "complete" profiles often have `N` as the legal name:
```
Complete Profile 1 (CRD: 177513):
  crd_number: 177513
  legal_name: N
  city: NEW YORK
  state: NY
  aum: 130681260421
  phone: (212) 994-7402
  website: https://alphacorewealth.com
```

This suggests widespread data parsing or loading issues that affected the core entity attributes.

## 7. Index Status

The `narratives_embedding_idx` index on the embedding column is defined in the migration file:

```sql
create index if not exists narratives_embedding_idx 
on narratives using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
```

However, without direct access to PostgreSQL's system catalogs, we can't confirm if this index was created. Based on the missing vector search functions, it's likely the index was not created either.

To create a new index on the JSON string embedding column while planning the pgvector migration:

```sql
-- For text search on the JSON string (temporary solution)
CREATE INDEX IF NOT EXISTS narratives_embedding_text_idx 
ON narratives USING gin ((embedding::text) gin_trgm_ops);

-- For the crd_number in narratives
CREATE INDEX IF NOT EXISTS narratives_crd_idx 
ON narratives (crd_number);
```

The eventual HNSW index creation after converting to native vector type would be:

```sql
CREATE INDEX narratives_embedding_hnsw_idx
ON narratives
USING hnsw (embedding::vector(768) vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## 8. ETL Error Logs

The embedding log shows the process started successfully:

```
🚀 Starting RIA Hunter data pipeline...

📊 Step 1: Loading RIA profiles...
Loading profiles from /Users/turner/projects/ria-hunter/output/ria_profiles.csv...
Found 40651 profiles
Processing 40651 profiles
Upserted 1000/40651 profiles
...
Upserted 40651/40651 profiles

Processing 10 narratives...
Embedded 510 narratives so far
Processing 10 narratives...
Embedded 520 narratives so far
```

The logs don't show explicit errors, but the process for control persons and private funds appears to be missing from the logs entirely. The most likely explanations are:

1. The ETL scripts for these entities were never run
2. They ran but failed early in the process
3. They were deprioritized in favor of the core RIA profiles

The `load_ria_profiles_all.ts` script shows a robust error handling approach for RIA profiles, but there's no evidence of similar scripts being run for related entities:

```javascript
for (let i = 0; i < prepared.length; i += batchSize) {
  const batch = prepared.slice(i, i + batchSize);
  const { error } = await supabase.from('ria_profiles').upsert(batch as any, { onConflict: 'crd_number' })
  if (error) {
    console.error(`Upsert batch ${i + 1}-${i + batch.length} error:`, error.message)
  } else {
    total += batch.length
    console.log(`Upserted ${total}/${prepared.length}`)
  }
}
```

## 9. Contact Submissions

The `contact_submissions` table is empty (0 rows) but does exist in the database.

Based on the code review, this table is likely populated by the `/api/save-form-data/route.ts` endpoint which would process form submissions from the website. The fact that it's empty suggests:

1. The contact form has never been tested with actual submissions
2. The endpoint may have errors that prevent successful submissions
3. The feature may be disabled or not yet implemented in the frontend

## 10. Role Policies

There's no evidence of Row Level Security (RLS) policies being enabled for the existing tables. The migration files don't contain explicit RLS policy definitions, and the database queries don't show RLS-related errors.

To improve security and data integrity, RLS policies could be implemented:

```sql
-- Enable RLS on sensitive tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_shares ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users to see only their own data
CREATE POLICY "Users can see only their own subscription data"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Similar policies for other user-specific tables
```

The public RIA data tables likely don't need RLS since they contain information that should be accessible to all users.

## Answers to Master AI Agent Questions

1. **Migration tracking**: No migration tracking table exists. All 23 migration files exist in the codebase, but we cannot determine which have been executed. Test migration commands fail with function not found errors.

2. **Function discovery**: Critical vector search functions (`match_narratives`, `search_rias`, `hybrid_search_rias`) are missing from all schemas. Only `compute_vc_activity` exists but returns parameter mismatch errors.

3. **Duplicate CRD numbers**: No duplicates were found in the sampled data. `crd_number` is confirmed to be the primary key with a unique constraint.

4. **AUM distribution**: Statistics show significant outliers (median $1,234 vs mean $1.7 billion). 26.45% of profiles have NULL or zero AUM. Private fund AUM values appear more consistent.

5. **Narrative job logs**: The narrative generation batch ran for 42 minutes, 49 seconds on August 21, 2025, processing 41,303 narratives at a rate of 964.48 per minute. It stopped before completing all profiles.

6. **Missing-field audit**: Critical fields have high missing rates: 14.76% missing legal names, 29.40% missing states, 26.45% missing AUM, 83.93% missing phone numbers, 99.90% missing websites, and 100% missing CIK values.

7. **Index status**: No evidence of the intended `narratives_embedding_idx` being created. Creating indexes on JSON embedding strings and crd_number would improve performance until the pgvector migration.

8. **ETL error logs**: No explicit errors found, but control person and private fund processing appears to be missing entirely from the logs, suggesting those scripts were never run successfully.

9. **Contact submissions**: The `contact_submissions` table exists but is empty (0 rows), likely populated by the `/api/save-form-data/route.ts` endpoint which has never been successfully used.

10. **Role policies**: No Row Level Security policies appear to be enabled. Implementing RLS for user-specific tables (subscriptions, queries, shares) would improve security.

## Recommendations

1. **Fix pgvector installation**: Ensure the pgvector extension is properly installed and available in the database.

2. **Reapply missing migrations**: Execute the critical SQL migrations, especially those creating vector search functions.

3. **Convert JSON embeddings**: Migrate the JSON string embeddings to native pgvector format for better performance.

4. **Complete narrative generation**: Resume the narrative generation process for the remaining 60% of profiles.

5. **Process related entities**: Run ETL scripts to properly process control persons and private funds data.

6. **Implement data validation**: Add validation rules to flag and correct anomalous AUM values and other data quality issues.

7. **Create missing indexes**: Add indexes on the `embedding` column (as native vector after migration) and `crd_number` in narratives.

8. **Establish migration tracking**: Implement a proper migration tracking system to prevent similar issues in the future.

9. **Add RLS policies**: Implement Row Level Security for user-specific tables to improve data security.

10. **Fix API endpoints**: Update API endpoints to handle the current data structure while migrations are being applied.
