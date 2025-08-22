# Additional Database Analysis - Answers for Master AI Agent

## 1. Function Definitions

The SQL definitions for the vector search functions are defined in migration file `20250805000000_add_vector_similarity_search.sql`:

### match_narratives

```sql
create or replace function match_narratives (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  crd_number text,
  narrative text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    narratives.crd_number,
    narratives.narrative,
    1 - (narratives.embedding <=> query_embedding) as similarity
  from narratives
  where narratives.embedding is not null
    and 1 - (narratives.embedding <=> query_embedding) > match_threshold
  order by narratives.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

### search_rias_by_narrative

```sql
create or replace function search_rias_by_narrative (
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 50,
  location_filter text default null,
  min_private_funds int default 0
)
returns table (
  crd_number text,
  legal_name text,
  narrative text,
  similarity float,
  city text,
  state text,
  private_fund_count int,
  private_fund_aum numeric,
  total_assets numeric
)
language plpgsql
as $$
begin
  return query
  select
    n.crd_number,
    r.legal_name,
    n.narrative,
    1 - (n.embedding <=> query_embedding) as similarity,
    r.city,
    r.state,
    coalesce(r.private_fund_count, 0)::int,
    coalesce(r.private_fund_aum, 0)::numeric,
    coalesce(r.total_assets, 0)::numeric
  from narratives n
  join ria_profiles r on n.crd_number = r.crd_number::text
  where n.embedding is not null
    and 1 - (n.embedding <=> query_embedding) > match_threshold
    and (location_filter is null or r.state ilike location_filter)
    and coalesce(r.private_fund_count, 0) >= min_private_funds
  order by n.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

The API code (`app/api/v1/ria/search/route.ts`) also references `search_rias` and `hybrid_search_rias` functions, but these are not defined in any of the migration files found. The actual calls in the code use these parameter signatures:

### search_rias (referenced in code)

```typescript
await supabaseAdmin.rpc('search_rias', {
  query_embedding: embedding,
  match_threshold: 0.5,
  match_count: limit || 20,
  state_filter: state || null,
  min_aum: minAum || 0
});
```

### hybrid_search_rias (referenced in code)

```typescript
await supabaseAdmin.rpc('hybrid_search_rias', {
  query_text: query,
  query_embedding: embedding,
  match_threshold: 0.5,
  match_count: limit || 20,
  state_filter: state || null,
  min_vc_activity: minVcActivity || 0,
  min_aum: minAum || 0
});
```

This mismatch between defined functions (`match_narratives`, `search_rias_by_narrative`) and those called in the code (`search_rias`, `hybrid_search_rias`) explains the "function not found" errors.

## 2. Field Origins

Analysis of the raw data files confirms that the source data does include the missing fields:

1. **Legal Name**: Present in raw data as "1A" column in IA_ADV_Base_A files (e.g., "STORGATE, LLC")

2. **City**: Present in raw data as "1F1-City" column in IA_ADV_Base_A files (e.g., "MARSHFIELD")

3. **State**: Present in raw data as "1F1-State" column in IA_ADV_Base_A files (e.g., "MA")

4. **Phone**: Present in raw data as "1F3" column in IA_ADV_Base_A files (e.g., "617-800-0388")

5. **Website**: Not directly present in the basic files; likely in Schedule D or related files

6. **CIK**: Present in raw data as "1N-CIK" column in IA_ADV_Base_A files, but often null

The ETL script (`load_ria_profiles_all.ts`) does explicitly parse most of these fields:

```typescript
const prepared = rows.map((row, idx) => {
  const rawCrd = row.crd_number
  const digits = rawCrd !== null && rawCrd !== undefined ? String(rawCrd).replace(/\D/g, '') : ''
  const crd = digits ? Number(digits) : 900000 + idx + 1
  return {
    crd_number: crd,
    legal_name: row.firm_name || null,
    city: row.city || null,
    state: row.state || null,
    aum: toNumber(row.aum),
    form_adv_date: row.form_adv_date || null,
  } as any
});
```

However, it does not map phone, website, or CIK fields. The expected field names in the input CSV (`firm_name`, `city`, `state`, `aum`) may not match the actual field names in the raw files ("1A", "1F1-City", etc.), which would explain why these fields are missing or incorrectly populated.

The `ProfileRow` type defined in the script only includes:
```typescript
type ProfileRow = {
  crd_number?: string | number | null
  firm_name?: string | null
  city?: string | null
  state?: string | null
  aum?: string | number | null
  zip_code?: string | null
  address?: string | null
  employee_count?: string | number | null
  form_adv_date?: string | null
}
```

There are no fields for phone, website, or CIK, suggesting these weren't part of the planned import.

## 3. ETL Status

No specific ETL logs were found for control person or private fund processing. However, we located the `populate_private_placement_data.py` script that should have populated private fund data.

The script shows a pattern of:
1. Loading analysis results from a CSV
2. Fetching existing RIA profiles from database
3. Matching firms by name (exact or partial matches)
4. Updating database with private fund information

The script includes a confirmation prompt before updating:
```python
confirm = input("Proceed with database update? (y/N): ").lower().strip()
if confirm != 'y':
    print("Update cancelled.")
    return
```

This suggests the script may have been run in interactive mode and potentially cancelled or never fully executed. The log output would have included:
```
Matching Summary:
Total firms analyzed: [X]
Exact matches: [Y]
Partial matches: [Z]
No matches: [W]
```

Without the actual log files, we cannot determine exactly how many rows were processed or why it stopped. However, given that only 292 private fund records exist in the database while the raw data contains millions, it's clear that the ETL process for private funds was either never fully executed or encountered significant errors.

Similarly, the control person processing logs are missing, with only 1,457 records in the database compared to hundreds of thousands in the raw data.

## 4. Contact Form Usage

The contact form endpoint `/api/save-form-data/route.ts` exists and is properly implemented:

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, subject, message' },
        { status: 400 }
      )
    }

    // Insert into contact_submissions table
    const { data, error } = await supabaseAdmin
      .from('contact_submissions')
      .insert([
        {
          name,
          email,
          subject,
          message,
          created_at: new Date().toISOString()
        }
      ])
      .select()
    // ...
```

This endpoint is called from the `ContactForm` component in `components/contact-form.tsx`:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setFormState("submitting")

  try {
    const response = await fetch('/api/save-form-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    // ...
```

However, the `contact_submissions` table is empty (0 rows), indicating that the form has likely never been successfully submitted in production. This could be because:

1. The form has never been used by real users
2. The frontend component might not be exposed in the UI
3. Form submissions might be failing due to validation errors
4. The API route might be encountering database errors

Without specific error logs, it's difficult to determine exactly why no submissions have been recorded.

## 5. AUM Outliers

The query for RIA profiles with the highest AUM values returned:

```
Top AUM values:
1. CRD: 331627, Name: BRIDGE FUND MANAGEMENT LIMITED, Location: N/A,   , AUM: $N/A, Form ADV Date: N/A
2. CRD: 324180, Name: STEALTHPOINT, LLC, Location: N/A,   , AUM: $N/A, Form ADV Date: N/A
3. CRD: 284910, Name: GOFF FOCUSED STRATEGIES LLC, Location: N/A,   , AUM: $N/A, Form ADV Date: N/A
4. CRD: 337894, Name: PRUDENTIAL CAPITAL GROUP INC., Location: N/A,   , AUM: $N/A, Form ADV Date: N/A
5. CRD: 335861, Name: N, Location: WILMINGTON, DE, AUM: $N/A, Form ADV Date: 2024-08-01
```

Interestingly, while these were returned by sorting on AUM in descending order, they all show "N/A" for AUM values, suggesting that the actual values in the database might be `NULL` but still sorted higher than actual values. This could indicate data type issues or incorrect sorting.

For profiles with AUM > $1 trillion:

```
Found 3 profiles with AUM > $1 trillion
- 3 have empty or 'N' legal names (100.00%)
- 0 have website URLs (0.00%)

Common locations for trillion+ AUM profiles:
- SAN FRANCISCO, CA: 1 profiles (33.33%)
- BOSTON, MA: 1 profiles (33.33%)
- BALTIMORE, MD: 1 profiles (33.33%)
```

All profiles with extremely high AUM values (>$1 trillion) have 'N' as their legal name, suggesting a pattern of data quality issues with these outliers. Without access to the raw files that specifically led to these entries, it's difficult to pinpoint the exact source, but this is strong evidence of data parsing or type conversion issues in the ETL process.

## 6. Narrative Backlog

Based on the processing metrics from the existing narrative generation job:

```
Narrative Backlog:
- Profiles with narratives: 41,303
- Profiles without narratives: 62,317
- Processing rate: 964.48 narratives per minute
- Estimated time to process remaining profiles: 1 hours, 4 minutes
- Total expected narratives after completion: 103,620
```

The remaining 62,317 profiles would take approximately 1 hour and 4 minutes to process at the observed rate of 964.48 narratives per minute.

The logs don't explicitly state why the initial job stopped after 42 minutes, but the embedding logs show the process was working successfully:

```
=== Batch 1 ===
✅ Embedded narrative for CRD 1870 (49/50)
✅ SUCCESS! Model: text-embedding-005, Dimensions: 768
✅ Embedded narrative for CRD 1871 (50/50)
❌ Errors: 0
🚀 SUCCESS! Vertex AI embedding generation is working!
```

The most likely reasons for the process stopping after 42 minutes include:
1. A scheduled job timeout or resource limitation
2. A manual interruption of the process
3. A temporary error or rate limit with the Vertex AI service
4. Database connection issues

Since the process was showing a high success rate (964 narratives per minute with very few errors), it was likely an external limitation or manual stop rather than a fundamental issue with the narrative generation itself.

## 7. Migration Tracking

Proposed SQL for migration tracking:

```sql
-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  checksum VARCHAR(64),
  execution_time NUMERIC,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  applied_by VARCHAR(255)
);

-- Function to record a migration
CREATE OR REPLACE FUNCTION public.record_migration(
  p_name VARCHAR,
  p_checksum VARCHAR DEFAULT NULL,
  p_execution_time NUMERIC DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_error TEXT DEFAULT NULL,
  p_applied_by VARCHAR DEFAULT CURRENT_USER
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO public.schema_migrations (
    name, checksum, execution_time, success, error, applied_by
  ) VALUES (
    p_name, p_checksum, p_execution_time, p_success, p_error, p_applied_by
  )
  ON CONFLICT (name) 
  DO UPDATE SET
    checksum = p_checksum,
    execution_time = p_execution_time,
    success = p_success,
    error = p_error,
    applied_by = p_applied_by,
    applied_at = NOW();
$$;

-- Function to check if a migration has been applied
CREATE OR REPLACE FUNCTION public.migration_applied(p_name VARCHAR)
RETURNS BOOLEAN LANGUAGE SQL AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schema_migrations 
    WHERE name = p_name AND success = TRUE
  );
$$;
```

This migration tracking system can be integrated into future deployments by:

1. Creating a migration runner script that:
   - Reads migrations from the filesystem in order
   - Checks if each migration has been applied using `migration_applied()`
   - Applies missing migrations and records results with `record_migration()`
   - Handles errors and rollbacks appropriately

2. Adding a deployment step in CI/CD to run the migration runner before code deployment

3. Updating local development workflow to run migrations as part of setup

4. Including a database status check in health endpoints to verify migrations are up to date

## 8. pgvector Availability

Due to limited permissions with the current client, we couldn't directly query `pg_available_extensions` to check pgvector availability. However, our tests showed:

```
Trying alternative approach - checking if vector operations work:
Found embedding data in narratives table.
This suggests pgvector extension might be installed but not properly configured for functions.
```

The presence of embedding data in the narratives table suggests the pgvector extension is likely installed and was used for initial data loading, but the vector search functions that depend on it aren't correctly configured or exposed.

## 9. PostgreSQL Version

Direct version queries failed due to permission restrictions:

```
Error getting PostgreSQL version directly: Could not find the function public.version without parameters in the schema cache
```

However, based on the Supabase client version and typical deployments:

```
Supabase JavaScript client version: 2.53.0
Supabase typically uses PostgreSQL 15+ for recent projects
```

The project is likely running on PostgreSQL 15 or newer, which fully supports pgvector and all the features used in the migrations.

## 10. Existing Indexes

Direct queries to `pg_indexes` failed due to permission restrictions:

```
Error checking indexes: Could not find the function public.list_indexes(table_name) in the schema cache
```

However, performance testing suggests the absence of effective indexes:

```
Query execution time: 101ms
This does not suggest an index might be present on crd_number.
```

The relatively slow query time (101ms) for a simple equality match on `crd_number` suggests there's no index on this field in the narratives table. If the vector index from the migration file (`narratives_embedding_idx`) had been created, we would expect better performance on vector similarity queries as well.

Migration file `20250805000000_add_vector_similarity_search.sql` defines an IVFFLAT index:

```sql
create index if not exists narratives_embedding_idx 
on narratives using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
```

But this index was likely not created successfully due to the migration issues.
