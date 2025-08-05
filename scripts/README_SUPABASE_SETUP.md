# RIA Hunter Supabase Setup Guide

This guide walks through setting up the proper relational database schema for RIA Hunter in Supabase, based on the original architectural plans.

## Overview

The original RIA Hunter architecture called for:
1. **XML data from IAPD Compilation Reports** as the primary data source
2. **A normalized relational schema** in Supabase to track advisers over time
3. **SQLAlchemy with PostgreSQL upsert logic** for idempotent data loading
4. **Proper indexing and views** for efficient querying

## Current Status

We have:
- ✅ Processed CSV data into `output/ria_profiles.csv` and `output/narratives.json`
- ✅ Created SQL schema definition in `scripts/create_ria_hunter_schema.sql`
- ✅ Built data loading script with proper upsert logic in `scripts/load_to_supabase.py`
- ⏳ Need to execute the schema in Supabase
- ⏳ Need to run the data loading script

## Setup Instructions

### 1. Create the Database Schema

1. Go to your Supabase SQL Editor:
   https://app.supabase.com/project/llusjnpltqxhokycwzry/sql

2. Copy the entire contents of `scripts/create_ria_hunter_schema.sql`

3. Paste and execute in the SQL editor

This will create:
- `advisers` table - Core RIA entities
- `filings` table - Track changes over time
- `private_funds` table - Private fund details
- `ria_narratives` table - Text content for embeddings
- Several views and indexes for performance

### 2. Load the Data

Run the data loading script:

```bash
python scripts/load_to_supabase.py
```

This will:
- Connect to Supabase using your service role key
- Load advisers with upsert logic (insert or update)
- Create filing records for each adviser
- Load narratives linked to advisers and filings

### 3. Verify the Data

After loading, you can verify in the Supabase SQL editor:

```sql
-- Check record counts
SELECT 
    (SELECT COUNT(*) FROM advisers) as advisers,
    (SELECT COUNT(*) FROM filings) as filings,
    (SELECT COUNT(*) FROM ria_narratives) as narratives;

-- View latest filing for each adviser
SELECT * FROM latest_adviser_filings LIMIT 10;

-- Find advisers in a specific state
SELECT * FROM advisers WHERE main_addr_state = 'CA' LIMIT 10;
```

## Architecture Benefits

This relational schema provides:

1. **Historical Tracking**: Each filing is a snapshot in time, allowing analysis of how RIAs change
2. **Efficient Queries**: Proper indexes on commonly searched fields (CIK, state, AUM)
3. **Data Integrity**: Foreign key constraints ensure referential integrity
4. **Flexibility**: JSONB fields for variable data like prime brokers
5. **Future-Ready**: Schema supports private funds and other Schedule D data when available

## Next Steps

1. **Implement XML parsing** when IAPD XML feeds become available
2. **Add private fund data** from Schedule D Section 7.B.1
3. **Enable Row Level Security** for multi-tenant access
4. **Create embeddings** for narrative content using Google AI Vertex

## Troubleshooting

If you get connection errors:
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `env.local`
- Check that your Supabase project is active
- Verify the database URL format

If schema creation fails:
- Drop existing tables first if they exist
- Check for any custom types or extensions needed

## Original Vision vs Current Implementation

**Original Plan**:
- Primary data source: XML from IAPD Compilation Reports
- Complex parsing with lxml and XSD validation
- Full Schedule D private fund details

**Current Implementation**:
- Using CSV data we already have
- Simplified but proper relational schema
- Ready for XML data when available
- Foundation for Google AI Vertex Document AI integration

The current implementation provides a solid foundation that aligns with the original architectural vision while being pragmatic about available data sources.