# RIA Hunter Database Analysis for Master AI Agent

## 1. Schema Inventory

The Supabase database contains the following tables:

- **ria_profiles**: Contains basic RIA information (103,620 rows)
- **narratives**: Contains text descriptions with vector embeddings (41,303 rows)
- **control_persons**: Lists people with control over RIAs (1,457 rows)
- **ria_private_funds**: Details private funds managed by RIAs (292 rows)
- **subscriptions**: User subscription information (0 rows)
- **user_queries**: Record of user search queries (0 rows)
- **user_shares**: Record of shared search results (0 rows)
- **contact_submissions**: Contact form submissions (0 rows)

The database has several SQL functions defined in the migrations, but many appear to be missing or not accessible via the API:

- `match_narratives`: For vector similarity search on narratives (defined in migrations but not accessible)
- `search_rias_by_narrative`: Enhanced search function joining with RIA profiles (defined but not accessible)
- `search_rias`: Vector search function (referenced in code but not accessible)
- `hybrid_search_rias`: Combined vector and text search function (referenced in code but not accessible)
- `compute_vc_activity`: Function to calculate venture capital activity scores (defined but returns error on execution)

## 2. Row Counts (Descending)

1. ria_profiles: 103,620 rows
2. narratives: 41,303 rows
3. control_persons: 1,457 rows
4. ria_private_funds: 292 rows
5. subscriptions: 0 rows
6. user_queries: 0 rows
7. user_shares: 0 rows
8. contact_submissions: 0 rows

## 3. Data Completeness

The raw data in `/raw` contains extensive ADV filing data organized by month, with dozens of CSV files per month containing different sections of the ADV forms. This includes:

- Basic RIA information (IA_ADV_Base_A/B files)
- Schedule A/B for control persons
- Schedule D for private funds
- Various other regulatory and disclosure information

However, there appears to be a significant discrepancy between the raw data and what's in the database:

- The raw files contain thousands of RIAs, but only a subset appears to be processed
- Private fund data is especially sparse, with only 292 records in the database despite thousands in the raw files
- Control person data is also limited (1,457 records)

Analysis of specific months shows that processing of raw data has been inconsistent.

## 4. Missing Narratives

While there are 103,620 RIA profiles in the database, only 41,303 have narratives with embeddings. This means approximately 62,317 profiles (60.1%) lack narratives and therefore cannot be found through semantic search.

Sample CRD numbers without narratives include:
- 653, 654, 655, 656, 657, 658, 659, 660, 661, 662

## 5. Vector Search Functions

Several vector search functions are defined in the migrations but appear to be missing from the actual database:

- `match_documents`: Not found
- `search_rias`: Not found
- `hybrid_search_rias`: Not found

The API code (`app/api/v1/ria/search/route.ts`) attempts to call these functions, which likely causes runtime errors. The functions were defined in the migrations but may not have been properly applied or were subsequently dropped.

## 6. Embedding Diagnostics

The narratives table does contain an `embedding` column with vector data:

- **Format**: Stored as JSON strings containing arrays (not native vectors)
- **Dimensionality**: 768 dimensions
- **Structure**: Example value starts with `[-0.07770659, -0.006385077, 0.018559987...]`

The embeddings appear to be using the standard 768-dimension format from a transformer model, stored as JSON strings rather than using the native pgvector type.

## 7. Private Fund Gaps

The private funds table contains only 292 records, which is extremely low compared to the thousands of funds identified in the raw Schedule D files. The disparity suggests:

- Incomplete ETL processing
- Selective import of only specific funds
- Possible data quality issues during import

Cross-checking specific firms reveals that many RIAs with private funds in the raw data have none in the database.

## 8. Control Person Coverage

Similar to private funds, the control person data shows significant gaps:

- The raw Schedule A/B data contains thousands of control persons
- The database only has 1,457 control person records
- This leaves most RIAs without executive/ownership information

## 9. ETL Audit

The ETL pipeline is primarily implemented through various TypeScript scripts:

- **Data Loading**: `scripts/load_ria_profiles_*.ts` scripts handle loading RIA profile data
- **Embedding Generation**: Multiple `embed_narratives_*.ts` scripts generate embeddings, with variants for different models/dimensions
- **Private Fund Processing**: `scripts/load_private_placement_data.py` and similar scripts handle fund data

The embedding scripts use Google's Vertex AI with the `textembedding-gecko@003` model to generate 768-dimension embeddings for narratives.

Key issues in the ETL process:
- Multiple, overlapping scripts with similar functionality
- Incomplete processing of raw data
- No clear orchestration or scheduling
- Error handling appears minimal

## 10. Subscription Features

The `subscriptions`, `user_queries`, and `user_shares` tables are defined but empty. These appear to be part of a planned premium subscription model:

- **Subscriptions**: Would track paid user subscriptions
- **User Queries**: Would log search history for users
- **User Shares**: Would allow saving and sharing search results

The code in `app/api/v1/ria/search/route.ts` references a query limit system that gives anonymous users 2 free queries, but this feature is not fully implemented.

## 11. Credit System

The system includes a credit-based query limiting system with:

- `validateApiAuth`: Checks user authentication status
- `logQueryUsage`: Tracks query usage for authenticated users
- `parseAnonCookie`: Tracks anonymous user query counts via cookies

For anonymous users, the system allows 2 free queries, tracking usage via cookies.

## 12. Performance Metrics

The `compute_vc_activity` function appears to be the most computationally intensive operation, calculating venture capital activity scores. However, testing this function returns an error, suggesting issues with its implementation or the underlying data.

Queries against the large `ria_profiles` table (103,620 rows) appear to perform adequately, but the vector search functionality seems to be broken entirely.

## 13. Top RIAs

### Top RIAs by AUM:
1. BRIDGE FUND MANAGEMENT LIMITED - $0.00 million
2. STEALTHPOINT, LLC - $0.00 million
3. GOFF FOCUSED STRATEGIES LLC - $0.00 million
4. PRUDENTIAL CAPITAL GROUP INC. - $0.00 million
5. N (WILMINGTON, DE) - $0.00 million
6. AFI CAPITAL PARTNERS LLC - $0.00 million
7. N (LYNCHBURG, VA) - $0.00 million
8. BLACKROCK ASSET MANAGEMENT CANADA LIMITED - $0.00 million
9. HONGSHAN CAPITAL ADVISORS LIMITED - $0.00 million
10. AKSIA PARTNERS LLC - $0.00 million

**Note**: There appears to be an issue with the AUM data, as all top firms show $0.00 million AUM.

### Top RIAs by Private Fund Count:
1. CHURCHILL MANAGEMENT GROUP (LOS ANGELES, CA) - 18 funds, $8,093.88 million AUM
2. RREEF AMERICA L.L.C. (CHICAGO, IL) - 13 funds, $31,829.90 million AUM
3. TENNENBAUM CAPITAL PARTNERS, LLC (SANTA MONICA, CA) - 11 funds, $6,087.36 million AUM
4. SVOF/MM, LLC (SANTA MONICA, CA) - 11 funds, $203.50 million AUM
5. TRUEHAVEN CAPITAL (ST PETERSBURG, FL) - 11 funds, $60.73 million AUM

## 14. Narrative Generation

Narratives are generated through a templated approach:

1. **Source Data**: Narratives are composed from RIA profile data
2. **Template**: Follows a pattern like "{LEGAL_NAME} is a registered investment adviser based in {CITY}, {STATE}. Their CRD number is {CRD_NUMBER} and they manage ${AUM} in assets..."
3. **Process**: The `embed_narratives.ts` script and its variants generate these narratives and then create embeddings
4. **Error Handling**: Minimal error handling, with failed embeddings simply logged

The embedding process uses Google's Vertex AI with the `textembedding-gecko@003` model to generate 768-dimension embeddings.

## 15. Environment Variables

Key environment variables used by the backend include:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin access
- `NEXT_PUBLIC_SUPABASE_URL`: Public URL for client-side access
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anonymous key for client-side access
- `GOOGLE_PROJECT_ID`: Google Cloud project ID for Vertex AI
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google Cloud credentials file
- `AI_PROVIDER`: AI provider selection (Google Vertex AI is used)

All critical environment variables appear to be set, but the application is not properly connecting to some database functions.

## 16. API Route Mapping

Major API routes include:

- **/api/v1/ria/search**: 
  - Parameters: query (string), state (optional), useHybridSearch (boolean), minVcActivity (number), minAum (number), limit (number)
  - Calls: `search_rias` or `hybrid_search_rias` functions (both missing)
  
- **/api/v1/ria/query**:
  - Similar to search but with different parameters
  
- **/api/ask**:
  - Natural language query interface
  - Uses `buildAnswerContext` to format results
  
- **/api/subscription-status**:
  - Checks user subscription status
  
- **/api/create-checkout-session**:
  - Creates Stripe checkout session for subscriptions

## 17. Security Roles

The application uses different Supabase roles:

- `anon`: For anonymous public access (limited features)
- `service_role`: For backend server operations (full access)

Row Level Security (RLS) policies do not appear to be heavily used since most data is intended to be publicly readable.

## 18. Index Usage

The database has several indexes defined in migrations:

- `narratives_embedding_idx`: Vector index on the embedding column (defined but may not be present)
- `idx_control_persons_crd`: Index on crd_number in control_persons
- `idx_ria_profiles_phone`: Index on phone in ria_profiles
- `idx_ria_profiles_website`: Index on website in ria_profiles

However, there's no evidence of HNSW indexes for pgvector, which would provide better performance for vector similarity searches.

## 19. Error Logs

No dedicated error logs were found, but console.log statements in the code indicate several potential error sources:

- Vector search function failures
- Missing database functions
- Embedding generation errors
- Authentication/authorization issues

## 20. Migration Status

The project contains 23 migration files in the `supabase/migrations` directory, including:

- `20250804194421_create_ria_tables.sql`: Initial table creation
- `20250805000000_add_vector_similarity_search.sql`: Adds vector search functions
- `20250120000000_reset_narratives_vector_768.sql`: Resets vector dimensions
- `20250814000100_add_missing_tables.sql`: Adds tables that were missing
- `20250814000000_fix_compute_vc_activity_column_reference.sql`: Fixes function issues
- `20250813000000_add_compute_vc_activity.sql`: Adds VC activity calculation

The migration files suggest an evolving schema with several fixes and updates. Discrepancies between the intended schema and the actual database suggest some migrations may have failed or were not properly applied.

## Critical Issues Summary

1. **Missing Vector Search Functions**: Core search functionality is broken due to missing SQL functions
2. **Incomplete Data Processing**: Only a fraction of the raw data has been processed into the database
3. **Missing Narratives**: 60% of RIA profiles lack narrative descriptions and embeddings
4. **AUM Data Issues**: Top RIAs show $0.00 AUM, indicating data quality problems
5. **Missing Subscription Features**: Subscription-related tables are defined but empty
6. **SQL Function Errors**: Functions like `compute_vc_activity` fail when executed

## Recommended Actions

1. **Fix Vector Search Functions**: Re-apply the migrations that create the vector search functions
2. **Complete Data Processing**: Process the remaining raw data into the database
3. **Generate Missing Narratives**: Create narratives and embeddings for all RIA profiles
4. **Fix AUM Data**: Investigate and correct the AUM data issues
5. **Implement Subscription Features**: Complete the subscription system implementation
6. **Fix SQL Function Errors**: Debug and fix the `compute_vc_activity` function
7. **Add HNSW Indexes**: Implement HNSW indexes for better vector search performance
