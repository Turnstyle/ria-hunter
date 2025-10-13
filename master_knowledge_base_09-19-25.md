# RIA Hunter - Master Knowledge Base (09-19-25)

## Purpose
Canonical reference for SEC data relationships and processing logic for Vertex AI Search RAG.
This file will be converted to .txt and uploaded to GCS bucket for knowledge base ingestion.

## Important Note on Implementation Details
This knowledge base contains historical implementation details from a custom PostgreSQL-based system for documentation completeness. Vertex AI Search will use its own optimized indexing and retrieval mechanisms. The specific SQL commands, database indexes, and vector search configurations documented here are provided for context about the data relationships and performance characteristics, but should NOT be required in the Vertex AI implementation. Vertex AI Search will automatically optimize indexing based on the raw data and usage patterns.

## Critical Architecture Notes
- **Primary Key:** CRD number (1-8 digits) for adviser entities
- **Secondary Key:** CIK number (exactly 10 digits with leading zeros) for SEC filings
- **Mapping Required:** Many files use CIK, must resolve to CRD for entity joining

## Raw Data Files Inventory
<!-- These files will be uploaded to GCS buckets -->

### Primary Data Sources
#### ADV Base Files
- **Path:** /raw/*/FIRM_ADV_Base_A_*.csv
- **Key:** FilingID links to CIK files
- **Contains:** Core adviser data with CRD in column 1E1
- **Update Frequency:** Quarterly SEC releases

#### CIK Mapping Files  
- **Path:** /raw/*/FIRM_1D3_CIK_*.csv
- **Key:** FilingID → CIK mapping
- **Critical:** Required to join CRD↔CIK

#### Private Funds Data
- **Path:** /raw/*/FIRM_Schedule_D_*.csv
- **Contains:** Fund details, GAV, fund types
- **Key:** Links via CRD from base files

## Raw Data Relationships

### SEC File Dependencies & Join Order
1. **Step 1: Start with Base Files**
   - Load `IA_ADV_Base_A_*.csv` (contains CRD in column 1E1)
   - Extract FilingID for joining
   - This is the master record for each adviser

2. **Step 2: Resolve CIK Numbers**
   - Join `IA_1D3_CIK_*.csv` using FilingID as key
   - Extract CIK and pad to 10 digits with leading zeros
   - Store CRD↔CIK mapping for future lookups

3. **Step 3: Add Private Fund Data**
   - Load `IA_Schedule_D_7B1_*.csv`
   - Join on CRD number from Step 1
   - Aggregate fund counts and total GAV per adviser

4. **Step 4: Add Control Persons**
   - Load control person files
   - Join on CRD number
   - Take top 5 executives by title hierarchy

### FilingID as Bridge
- **Purpose:** FilingID is the universal key across SEC form sections
- **Format:** Alphanumeric identifier unique per filing
- **Relationship:** Connects IA_ADV_Base_A records to IA_1D3_CIK records
- **Critical Note:** FilingID changes with each filing; use latest for current data
- **Key Insight:** This is how CRD numbers (in Base_A) connect to CIK numbers (in 1D3_CIK)

### Data Completeness Expectations
- **Base Files (IA_ADV_Base_A):**
  - Expected: ~40,000-45,000 active RIAs per quarter
  - Validation: Count distinct CRD numbers
  - Missing CRDs indicate data quality issues

- **CIK Mappings:**
  - Expected: ~95% of RIAs have CIK numbers
  - State-only registered advisers may lack CIK
  - Validation: Join rate should exceed 90%

- **Private Funds:**
  - Expected: ~30% of RIAs manage private funds
  - Large advisers (>$1B AUM) almost always have funds
  - Validation: Check fund_count > 0 for large advisers

- **Row Count Expectations:**
  - Distinct CRD numbers in base_a: ~40,000-45,000
  - CIK mapping records: Should approximately match base_a count
  - Distinct CRD numbers with private funds: ~12,000-15,000 (30% of total)

## Entity Schemas

### Adviser Entity (Historical Database Schema for Reference)
```sql
-- Historical PostgreSQL Table: ria_profiles
crd_number BIGINT PRIMARY KEY
legal_name TEXT NOT NULL
sec_number TEXT
address TEXT
city TEXT
state TEXT (2-letter code)
zip_code TEXT
aum NUMERIC
employee_count INTEGER
website TEXT
phone TEXT
cik TEXT (10 digits with leading zeros)
form_adv_date DATE
-- Denormalized aggregate fields:
private_fund_count INTEGER
private_fund_aum NUMERIC
-- Vector search field:
embedding_768 VECTOR(768)
```

### Adviser Entity (Extended Source Schema from seed/ria_profiles.csv)
```
Additional fields available in source data:
- services TEXT
- client_types TEXT
- is_registered BOOLEAN
- business_description TEXT
- registration_status TEXT
- primary_business_name TEXT
- main_office_location TEXT
```

### Private Fund Entity (Historical Schema)
```sql
-- Historical PostgreSQL Table: ria_private_funds (when normalized)
id UUID PRIMARY KEY
crd_number BIGINT REFERENCES ria_profiles(crd_number)
fund_name TEXT
fund_type TEXT (Venture Capital/Private Equity/Hedge/Other)
gross_asset_value NUMERIC (GAV)
is_3c1 BOOLEAN
is_3c7 BOOLEAN
is_master BOOLEAN
is_feeder BOOLEAN
```

### Control Person Entity (Historical Schema)
```sql
-- Historical PostgreSQL Table: control_persons
crd_number BIGINT REFERENCES ria_profiles(crd_number)
person_name TEXT
title TEXT
-- Legacy columns:
adviser_id TEXT (maps to crd_number)
full_name TEXT (legacy, use person_name)
```

## Processing Rules

### Rule: CRD to CIK Resolution
- **Source:** scripts/populate_cik_data.ts
- **Logic:** Join FilingID from Base_A files to CIK files, extract CRD from column 1E1
- **Critical:** Pad CIK to 10 digits with leading zeros
- **Validation:** CRD must be 1-8 digits, CIK must be exactly 10

### Rule: Fund Type Classification
- **Source:** scripts/build_narratives.py
- **VC Detection:** fund_type contains 'venture' or 'vc' or 'startup' (case-insensitive)
- **PE Detection:** fund_type contains 'private equity' or 'pe' or 'buyout'
- **Alternative Detection:** fund_type contains 'alternative' or 'hedge' or 'special situations'
- **Used For:** Filtering advisers with VC/PE activity

### Rule: Narrative Generation Pattern
- **Source:** scripts/build_narratives.py
- **Template:** "{firm_name} is a registered investment adviser located in {city}, {state} with CRD number {crd} managing ${aum} in assets with {employees} employees"
- **Enrichment:** Add fund counts, types if available

### Rule: VC Activity Scoring Algorithm
- **Source:** supabase/migrations/20250813000000_add_compute_vc_activity.sql
- **Formula:** `activity_score = (fund_count * 0.6) + (total_aum_millions * 0.4)`
- **VC Fund Detection:** Keywords: '%venture%', '%vc%', '%startup%'
- **Ranking:** Order by activity_score DESC
- **Executive Enrichment:** Includes top 5 executives from control_persons table

### Rule: Hybrid Search Algorithm (Historical Implementation)
- **Source:** scripts/create_advanced_search_functions.sql
- **Concept:** Combined semantic similarity with keyword matching
- **Historical Formula:** `combined_score = (vector_similarity * 0.7) + (text_match_rank * 0.3)`
- **Vector Dimension:** 768 (from textembedding-gecko model)
- **Key Insight:** Pure vector search alone was insufficient; combining with text matching improved relevance
- **Note for Vertex AI:** This hybrid approach improved results in our PostgreSQL system. Vertex AI Search has its own sophisticated relevance algorithms that may handle this differently.

### Rule: Private Placement Ranking
- **Source:** scripts/identify_top_stl_ria_final.py
- **Primary Sort:** num_private_funds (descending)
- **Secondary Sort:** total_gross_assets (descending)
- **Geographic Filtering:** Handle variations (ST. LOUIS, ST LOUIS, SAINT LOUIS)
- **Data Sources:** IA_Schedule_D_7B1 (funds) + IA_ADV_Base_A (advisers)

### Rule: Fund Reclassification Heuristics
- **Source:** logs/fund_classification_2025-09-09.log
- **Special Situations + Opportunities:** Reclassify to "Private Equity (Buyout)"
- **Special Situations + Advantage/Alpha:** Reclassify to "Alternative Investment"
- **Applied During:** Post-processing enrichment phase

## Business Intelligence Patterns

### Fund Classification Edge Cases
- **Problem:** Generic fund names like "Special Situations Fund" lack specificity
- **Solution:** Apply secondary keyword analysis for reclassification
- **Rules Applied:**
  - "Special Situations" + "Opportunities" → "Private Equity (Buyout)"
  - "Special Situations" + "Advantage" → "Alternative Investment"
  - "Special Situations" + "Alpha" → "Alternative Investment"
  - "Growth" + "Venture" → "Venture Capital"
  - "Seed" + "Early Stage" → "Venture Capital"
- **Implementation:** Post-processing enrichment after initial classification

### Data Quality Thresholds
- **Complete Profile Definition:** 8 required fields must be non-null and non-empty
  1. `legal_name` - Cannot be NULL or empty string
  2. `crd_number` - Must be 1-8 digit number
  3. `city` - Cannot be NULL or empty
  4. `state` - Must be valid 2-letter code
  5. `aum` - Cannot be NULL or 0
  6. `phone` - Must have valid format
  7. `website` - Should have valid URL
  8. `form_adv_date` - Must have recent filing date
- **Quality Score:** Profiles with <6 fields are marked as "incomplete"
- **Usage:** Incomplete profiles excluded from premium search results

### Performance Benchmarks (Historical PostgreSQL System)
- **Baseline (Pre-Optimization):**
  - Search queries: 1800ms average
  - Geographic filters: 2500ms+ with timeouts
  - Vector search: Not functional
- **Post-Optimization Results in PostgreSQL:**
  - Search queries: <10ms (180x improvement)
  - Geographic filters: <50ms with fuzzy matching
  - Vector search: <100ms for 100k vectors
- **Key Performance Requirements Identified:**
  - Fast geographic filtering with variation handling
  - Sub-second semantic search across 40k+ profiles
  - Efficient fund type classification queries
  - Must complete within 30-second Vercel timeout
- **Note:** These benchmarks are specific to our PostgreSQL implementation. Vertex AI Search will have its own performance profile.

## Field Mappings
<!-- From src/lib/mapping/mappings.json -->

### Canonical Field Names
- All variations of company name → firm_name
- CRD Number, Central Registration Depository Number → crd_number  
- Assets Under Management, AUM, Total AUM → aum
- [Full mapping table in mappings.json - 40+ field variations]

## Validation Rules
<!-- From src/lib/mapping/validators.ts -->

### Required Fields
1. firm_name - Must not be empty
2. crd_number - Must be 1-8 digits
3. address, city, state, zip_code - All required for valid profile

### Format Rules
- Phone: Normalize to +1XXXXXXXXXX (E.164)
- State: 2-letter uppercase codes only
- ZIP: 5 digits or 5+4 format (XXXXX-XXXX)
- URL: Add https:// if missing protocol

## Data Quality Notes

### Core Data Integrity Rules
- Some advisers have CRD but no CIK (state-registered only)
- Form ADV updates annually or on material changes
- Latest filing wins for duplicate CRDs
- Fund data may be incomplete for smaller advisers
- **Vector Dimensions:** System uses 768-dimensional embeddings (not 384)
- **Batch Processing:** Large operations require 5,000 record batches due to Supabase timeouts

### Known Data Issues
- **Embedding Generation Failures:** Multiple CRDs failed with "embeddingModel.predict is not a function"
- **Missing Narratives:** ~60% of profiles lack narrative enrichment
- **Geographic Variations:** Must handle "ST. LOUIS", "ST LOUIS", "SAINT LOUIS" as equivalent
- **Encoding:** Raw CSV files require latin-1 encoding, not UTF-8

### Performance Optimizations (Historical Results)
- **Search Performance:** Improved from 1800ms to <10ms in PostgreSQL system
- **Key Access Patterns That Needed Optimization:**
  - Geographic filtering (city/state combinations)
  - AUM range queries
  - Fund type text matching with variations
  - Vector similarity search for semantic queries
- **Vercel Timeout:** All API functions have 30-second hard limit (platform constraint)
- **Note:** These performance metrics are from our PostgreSQL implementation. Vertex AI Search will have different performance characteristics.

## Data Processing Lessons Learned

### Encoding Issues
- **Critical Finding:** SEC CSV files MUST use `latin-1` encoding, NOT UTF-8
- **Impact:** Using UTF-8 causes silent data corruption and parsing failures
- **Discovery:** Cost significant debugging time during initial data loads
- **Solution:** Always specify `encoding='latin-1'` when reading SEC CSV files
- **Affected Files:** All IA_ADV_Base_A, IA_1D3_CIK, IA_Schedule_D files

### Geographic Normalization
- **Problem:** City names have multiple valid representations in SEC data
- **Variations Found:**
  - "ST. LOUIS" (with period and space)
  - "ST LOUIS" (no period)
  - "SAINT LOUIS" (spelled out)
  - Similar patterns for: ST. PAUL, FT. WORTH, MT. VERNON
- **Key Requirement:** System must handle all these variations as equivalent
- **Historical Solution:** Used fuzzy text matching in PostgreSQL
- **Note for Vertex AI:** These variations exist in the raw data and queries. Vertex AI Search should handle these equivalencies.

### Batch Processing Constraints (Historical PostgreSQL/Supabase)
- **Historical Constraint:** Supabase SQL Editor had execution timeout limits
- **Threshold Found:** Operations over 5,000 records triggered timeouts
- **Historical Solution:** Batched operations into 5,000-record chunks
- **Scale Context:**
  - Total narratives processed: 41,303
  - Total RIA profiles: ~40,000-45,000
- **Note for Vertex AI:** These batch sizes reflect PostgreSQL/Supabase limitations. Vertex AI Search will have different scaling characteristics and batch processing capabilities.

### Vector Dimension Evolution
- **Initial Implementation:** 384-dimensional vectors (incorrect assumption)
- **Actual Requirement:** 768-dimensional vectors from textembedding-gecko
- **Migration Impact:** Required complete re-generation of all embeddings
- **Lesson:** Always verify model output dimensions before database schema design
- **Current State:** System supports both dimensions for backward compatibility

## Architectural Decisions & Rationale

### Credits System Removal
- **Original Design:** Complex database-backed credits system with transactions table
- **Problems Encountered:**
  - Over-engineered for simple use case
  - Database overhead for tracking every search
  - Complex state management across sessions
  - Poor user experience with credit anxiety
- **Decision:** Removed entirely in favor of simple cookie-based demo
- **Current Implementation:** `rh_demo` cookie tracks 5 free searches for non-subscribers
- **Benefits:** Simpler code, better UX, reduced database load

### API Routing Consolidation
- **Original Structure:** Dual routing with `/api/*` and `/_backend/api/*` paths
- **Problems:**
  - Confusion about which path to use
  - Duplicate route handling logic
  - Deployment complexity with path rewrites
- **Decision:** Consolidated all endpoints to standard Next.js `/api/*` structure
- **Migration:** All `/_backend/api/*` routes permanently removed
- **Benefit:** Standard Next.js patterns, simpler deployment, clearer codebase

### Denormalization Choice for Private Funds
- **Original Design:** Normalized with separate `ria_private_funds` table
- **Performance Issue:** JOIN operations caused query timeouts on large datasets
- **Decision:** Denormalized to add `private_fund_count` and `private_fund_aum` directly to `ria_profiles`
- **Trade-off:** Storage redundancy accepted for 100x query performance gain
- **Implementation:** Aggregate fields updated via triggers on fund changes

### Index Strategy Details (Historical PostgreSQL Implementation)
- **Problem:** Queries timing out at >1800ms on 100k+ records
- **Root Cause Analysis:**
  - Sequential scans on geographic fields
  - No text search optimization for variations
  - Missing vector search index
- **Historical Solution in PostgreSQL (For Reference Only):**
  - Compound indexes on geographic fields (city, state)
  - Full-text search indexes for fund type variations
  - Trigram indexes for fuzzy text matching
  - HNSW vector indexes for semantic search
- **Result:** Query performance improved from 1800ms to <10ms (180x improvement)
- **Note for Vertex AI:** These specific PostgreSQL optimizations are provided to illustrate the data access patterns and performance requirements. Vertex AI Search will handle indexing automatically and more efficiently through its own mechanisms.

## System Architecture

### AI Service Configuration
- **Provider:** Google Vertex AI (sole provider, no OpenAI) [[memory:9124028]]
- **Generation Model:** gemini-pro
- **Embedding Model:** textembedding-gecko (768 dimensions)
- **Circuit Breaker:** opossum library with 2.5s timeout, graceful degradation
- **Query Decomposition:** Gemini Function Calling for structured filter extraction

## Operational Constraints

### Vercel 30-Second Limit
- **Hard Constraint:** All API functions terminate at 30 seconds
- **Impact on Design:**
  - No long-running ETL processes in API routes
  - Batch operations must complete within limit
  - Large queries require pagination
- **Workarounds:**
  - Use background jobs for data processing
  - Implement cursor-based pagination
  - Cache expensive computations
- **Configuration:** Set in `vercel.json` with `maxDuration: 30`

### Circuit Breaker Pattern
- **Library:** opossum for Node.js
- **Configuration:**
  ```javascript
  {
    timeout: 2500,        // 2.5 second timeout
    errorThresholdPercentage: 50,
    resetTimeout: 30000   // 30 second reset
  }
  ```
- **Fallback Behavior:**
  - On AI service failure: Return context-only results
  - On database timeout: Return cached results if available
  - On complete failure: Return graceful error message
- **Monitoring:** Track circuit state in application logs

### Retry Logic Patterns
- **Embedding Generation:**
  - Max Attempts: 3
  - Backoff: Exponential (1s, 2s, 4s)
  - Failure Action: Log CRD and continue batch
  - Error Pattern: "embeddingModel.predict is not a function"
  
- **Database Operations:**
  - Max Attempts: 2
  - Backoff: Linear (500ms)
  - Failure Action: Return error to client
  
- **External API Calls:**
  - SEC EDGAR: 5 retries with 1s delay
  - Stripe Webhooks: No retry (idempotent handling)
  - Vertex AI: 3 retries with exponential backoff

### Rate Limiting & Throttling
- **Supabase Limits:**
  - Connection Pool: 50 concurrent connections
  - Query Timeout: 8 seconds default
  - Batch Size: 5,000 records max
  
- **Vertex AI Quotas:**
  - Embeddings: 600 requests/minute
  - Generation: 60 requests/minute
  - Batch Processing: Queue with 100ms delay between requests

- **Implementation:**
  ```javascript
  // Batch processing pattern
  const BATCH_SIZE = 5000;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    await processBatch(i, Math.min(i + BATCH_SIZE, total));
    await delay(100); // Prevent rate limiting
  }
  ```

### API Architecture
- **Routing:** All endpoints use `/api/*` path structure (no `/_backend/api/*`)
- **Session Management:** Cookie-based demo (rh_demo) with 5-search limit for non-subscribers
- **Authentication:** Stripe webhooks manage `is_subscriber` flag
- **Credits System:** Deprecated - removed in favor of simple session model

### Data Pipeline Architecture
1. **Traditional ETL:** Raw CSV → Scripts → Supabase
2. **Modern DocAI Pipeline:** 
   - Fetch (SEC EDGAR API)
   - Process (Vertex AI Document AI)
   - Normalize (field mapping/validation)
   - Store (upsert to Supabase)

## Google Cloud Deployment
<!-- Instructions for Vertex AI Search setup -->

### Bucket Structure
```
gs://ria-hunter-data/
  ├── raw-data/          # Original SEC CSV files
  ├── knowledge-base/    # This file as .txt
  └── processed/         # Optional structured data
```

### Data Store Configuration
- Type: Unstructured documents
- Import: knowledge-base/master_knowledge_base_09-19-25.txt
- Connected App: ria-hunter-search (create new)
