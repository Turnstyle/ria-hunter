# Document AI Ingestion Pipeline

This module provides a complete pipeline for ingesting SEC Form ADV documents using Google's Document AI, extracting structured data, and storing it in Supabase.

## Overview

The pipeline consists of the following steps:

1. **Fetch** - Download SEC Form ADV documents using the SEC EDGAR database
2. **Process** - Extract structured data using Google Vertex AI Document AI
3. **Normalize** - Transform extracted fields to match our database schema
4. **Store** - Upsert the normalized data to Supabase

## Setup

### Prerequisites

- Node.js 16+
- Google Cloud Platform account with Document AI enabled
- Supabase project
- Environment variables set (see below)

### Environment Variables

Create a `.env` file in the project root with the following variables:

```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Cloud Configuration
GOOGLE_PROJECT_ID=your_google_project_id
GOOGLE_CLIENT_EMAIL=your_google_client_email
GOOGLE_PRIVATE_KEY=your_google_private_key
DOCUMENT_AI_PROCESSOR_ID=your_document_ai_processor_id
DOCUMENT_AI_PROCESSOR_LOCATION=your_document_ai_processor_location

# SEC API Configuration
SEC_API_KEY=your_sec_api_key (if needed)
SEC_API_BASE_URL=https://www.sec.gov/
```

## Usage

### Process a Single CIK

```typescript
import { runIngestionPipeline } from './src/docai';

// Process a single CIK
runIngestionPipeline('0001234567')
  .then(result => console.log('Processing complete:', result))
  .catch(error => console.error('Error:', error));
```

### Batch Processing

```typescript
import { processBatch } from './src/docai/batch';

// Process multiple CIKs
const cikList = [
  '0001234567',
  '0001234568',
  '0001234569'
];

processBatch(cikList)
  .then(results => console.log('Batch processing complete:', results))
  .catch(error => console.error('Error:', error));
```

### CLI Usage

Process a single CIK:

```bash
npx ts-node src/docai/index.ts 0001234567
```

Process a batch of CIKs from a file:

```bash
npx ts-node src/docai/batch.ts path/to/cik-list.txt
```

Where `cik-list.txt` contains one CIK per line.

## Module Structure

- `index.ts` - Main entry point that orchestrates the pipeline
- `fetcher.ts` - SEC EDGAR API client for downloading Form ADV documents
- `processor.ts` - Google Document AI integration for extracting data
- `normalizer.ts` - Field normalization and data cleanup
- `storage.ts` - Supabase database operations
- `batch.ts` - Utilities for batch processing

## Database Schema

The pipeline works with the `ria_profiles` table in Supabase, which should have the following schema:

```sql
CREATE TABLE ria_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_name TEXT NOT NULL,
  crd_number TEXT NOT NULL,
  sec_number TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  aum BIGINT,
  employee_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX ria_profiles_crd_number_idx ON ria_profiles (crd_number);
``` 