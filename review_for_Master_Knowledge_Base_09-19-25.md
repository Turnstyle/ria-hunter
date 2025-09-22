# RIA Hunter - Review for Master Knowledge Base (09-19-25)

## 🎯 MISSION
Extract domain knowledge for Vertex AI Search RAG implementation. NO new features, NO code generation, ONLY knowledge harvesting.

## 📋 HOW TO USE
1. Find first 🔴 RED item
2. Change to 🟡 YELLOW when starting
3. Work in batches of ≤10 items
4. STOP for human approval before writing to Master KB
5. Update to 🟢 GREEN only after approved completion
6. Fill Session Handoff before stopping

## Status Legend
- 🔴 **NOT STARTED** - Ready to begin
- 🟡 **IN PROGRESS** - Currently working
- 🟢 **COMPLETED** - Verified and transferred to Master KB
- ❌ **BLOCKED** - Needs human intervention
- ⏸️ **PAUSED** - Partially complete, can resume
- 🔵 **RAW DATA** - Physical data file for GCS upload

## Knowledge Domains (Priority Order)
1. **Identifier Resolution** - CRD/CIK/SEC number mappings
2. **Raw Data Schema** - Structure and relationships of SEC files
3. **Field Normalization** - Canonical field names and validation
4. **Data Pipeline** - Processing flow from raw to structured
5. **Business Logic** - Fund analysis, VC detection, narrative generation

## Progress Tracker
**Overall Progress:** 25/25 tasks (100% complete)
**Current Session:** September 19, 2025
**Current Agent:** Gemini 2.5 Pro
**Status:** Gemini analysis phase complete. Ready for Opus review.

## Index
<!-- Maintained as items are added: 1a, 1b, 2a... -->
- [1a. scripts/populate_cik_data.ts](#1a-scriptspopulate_cik_datats)
- [1b. scripts/fix_crds_from_baseA.ts](#1b-scriptsfix_crds_from_baseats)
- [1c. app/api/v1/ria/funds/[identifier]/route.ts](#1c-appapiv1riafundsidentifierroutets)
- [2a. raw/ADV_Filing_Data_*/IA_ADV_Base_A_*.csv](#2a-rawadv_filing_data_ia_adv_base_a_csv)
- [2b. raw/ADV_Filing_Data_*/IA_1D3_CIK_*.csv](#2b-rawadv_filing_data_ia_1d3_cik_csv)
- [3a. src/lib/mapping/mappings.json](#3a-srclibmappingmappingsjson)
- [3b. src/lib/mapping/validators.ts](#3b-srclibmappingvalidatorsts)
- [4a. app/api/ask/profile/[crd]/route.ts](#4a-appapiaskprofilecrdroutets)
- [5a. scripts/build_narratives.py](#5a-scriptsbuild_narrativespy)
- [5b. scripts/load_to_supabase.py](#5b-scriptsload_to_supabaseny)
- [6a. API_DOCUMENTATION.md](#6a-api_documentationmd)
- [6b. API_ASK_MIGRATION_SUMMARY.md](#6b-api_ask_migration_summarymd)
- [7a. raw/ADV_Filing_Data_*/IA_Schedule_D_7B1_*.csv](#7a-rawadv_filing_data_ia_schedule_d_7b1_csv)
- [8a. src/lib/mapping/validation_notes.md](#8a-srclibmappingvalidation_notesmd)
- [9a. scripts/parallel_fix_names.sh](#9a-scriptsparallel_fix_namessh)
- [9b. SEMANTIC_SEARCH_FIX_INSTRUCTIONS.md](#9b-semantic_search_fix_instructionsmd)
- [10a. supabase/migrations/20250804194421_create_ria_tables.sql](#10a-supabasemigrations20250804194421_create_ria_tablessql)
- [10b. supabase/migrations/20250804200000_add_private_placement_data.sql](#10b-supabasemigrations20250804200000_add_private_placement_datasql)
- [11a. src/docai/README.md](#11a-srcdocaireadmemd)
- [12a. supabase/migrations/20250813000000_add_compute_vc_activity.sql](#12a-supabasemigrations20250813000000_add_compute_vc_activitysql)
- [13a. Docs/Final_Refactor_Backend_Plan_v2_22-Aug-2025.md](#13a-docsfinal_refactor_backend_plan_v2_22-aug-2025md)
- [14a. seed/ria_profiles.csv](#14a-seedria_profilescsv)
- [15a. output/FINAL_ANALYSIS_SUMMARY.md](#15a-outputfinal_analysis_summarymd)
- [16a. ChatGPT_Master_AI_plan_25_August_2025.md](#16a-chatgpt_master_ai_plan_25_august_2025md)

### 1a. scripts/populate_cik_data.ts
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** populate_cik_data.ts
- **Issue ID:** RH-09-19-25-1a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Identifier Resolution
- **File Summary (≤225):** Core script that resolves CIK numbers for advisers using the Filing ID from base ADV forms. It reads raw SEC files, joins them, extracts the CRD and CIK, and pads the CIK to the required 10-digit format for storage.
- **Value Assessment (≤150):** This script contains the primary business logic for connecting the two most critical identifiers: CRD and CIK. Without this, no entity joining is possible.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Read the script to identify the exact source files (`IA_ADV_Base_A` and `IA_1D3_CIK`).
  2. Document the join key (Filing ID) and the columns used for CRD and CIK extraction.
  3. Extract the rule for padding CIKs with leading zeros to create a 10-digit identifier.
  4. Add this logic under the "Processing Rules" section in the Master KB, citing this script as the source.
- **Rationale (≤225):** This is the foundational rule for the entire system. Capturing it ensures Vertex AI understands how to link disparate SEC filings back to a single adviser entity, which is essential for accurate retrieval.
- **Dependencies:** 2a, 2b
- **Vertex AI Note:** Teaches the search engine the fundamental rule for linking an adviser's CRD number with their SEC CIK filing number, enabling queries that span both identifiers.

### 1b. scripts/fix_crds_from_baseA.ts
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** fix_crds_from_baseA.ts
- **Issue ID:** RH-09-19-25-1b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Identifier Resolution
- **File Summary (≤225):** This script specifically handles the extraction of the adviser's CRD number from the raw `IA_ADV_Base_A` files. It locates the correct column (1E1) and likely contains logic to clean or validate the extracted number.
- **Value Assessment (≤150):** Defines the source of truth for an adviser's primary identifier (CRD). It's a critical first step in the entire data processing pipeline.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Confirm that column "1E1" is the source for the CRD number in the `IA_ADV_Base_A` file.
  2. Document this mapping in the "Raw Data Files Inventory" section of the Master KB.
  3. Note any validation or data cleaning logic applied to the CRD number (e.g., ensuring it's a 1-8 digit number).
  4. This provides the origin story for the primary key of every adviser entity.
- **Rationale (≤225):** Pinpoints the exact origin of the primary identifier (CRD) within the raw SEC data. This provenance is critical for data quality and for teaching Vertex AI which field represents the main entity key.
- **Dependencies:** 2a
- **Vertex AI Note:** Explains where the canonical CRD number comes from within the raw SEC data, allowing the system to trust and prioritize this field as the primary entity identifier.

### 1c. app/api/v1/ria/funds/[identifier]/route.ts
- **Directory Path:** /Users/turner/projects/ria-hunter/app/api/v1/ria/funds/[identifier]/
- **File Name:** route.ts
- **Issue ID:** RH-09-19-25-1c
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Identifier Resolution
- **File Summary (≤225):** An API endpoint that retrieves fund information. Crucially, its logic must resolve an incoming identifier (which could be CRD or CIK) to the canonical CRD number to perform the database lookup for associated funds.
- **Value Assessment (≤150):** Demonstrates the real-world application of the CRD↔CIK mapping. It shows how the system must handle different incoming identifiers to find the correct entity.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Examine the code to see how it determines if the `[identifier]` is a CRD or a CIK.
  2. Document the logic used to convert a CIK back to a CRD for the database query.
  3. This represents a "reverse lookup" rule compared to the initial data processing.
  4. Add this to the Master KB as a practical example of identifier resolution in the application layer.
- **Rationale (≤225):** Captures the "reverse" lookup logic (CIK to CRD) used in the application. This is a key query pattern that Vertex AI will need to understand to answer user questions regardless of which ID they provide.
- **Dependencies:** 1a
- **Vertex AI Note:** This shows how the application handles CRD and CIK interchangeably at query time. This knowledge allows the search to understand that both IDs refer to the same entity.

### 2a. raw/ADV_Filing_Data_*/IA_ADV_Base_A_*.csv
- **Directory Path:** /Users/turner/projects/ria-hunter/raw/ADV_Filing_Data_*/
- **File Name:** IA_ADV_Base_A_*.csv
- **Issue ID:** RH-09-19-25-2a
- **Status:** 🔵 RAW DATA
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** The foundational raw data file from the SEC. It contains the core registration information for each investment adviser, including their primary identifier, the CRD number, in column 1E1.
- **Value Assessment (≤150):** This is the source of truth for all adviser entity data. Understanding its structure is non-negotiable for the entire system.
- **Recommendation (≤100):** Upload to GCS
- **Suggested Actions (200-600):**
  1. Mark for upload to the `gs://ria-hunter-data/raw-data/` bucket.
  2. In the Master KB, update the "Raw Data Files Inventory" section to detail this file.
  3. Specify that it contains the core adviser profile data and that the CRD number is in column "1E1".
  4. Also, note that the "FilingID" column is the key for joining to the CIK mapping files.
- **Rationale (≤225):** This file is the genesis of all adviser data. Documenting its structure and key fields is the first step in explaining the entire knowledge graph to Vertex AI, and the file itself is needed for archival.
- **Dependencies:** None
- **Vertex AI Note:** This file provides the ground-truth schema for an adviser. It tells the search what fields to expect for a core adviser profile and which field (CRD) is the primary key.

### 2b. raw/ADV_Filing_Data_*/IA_1D3_CIK_*.csv
- **Directory Path:** /Users/turner/projects/ria-hunter/raw/ADV_Filing_Data_*/
- **File Name:** IA_1D3_CIK_*.csv
- **Issue ID:** RH-09-19-25-2b
- **Status:** 🔵 RAW DATA
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** A critical mapping file from the SEC. It connects the "FilingID" from the base ADV forms to the 10-digit CIK number used in other SEC filings. This file is the bridge that makes CRD↔CIK resolution possible.
- **Value Assessment (≤150):** This file provides the explicit link between the two key identifiers. Without it, the CRD↔CIK mapping logic in `populate_cik_data.ts` cannot function.
- **Recommendation (≤100):** Upload to GCS
- **Suggested Actions (200-600):**
  1. Mark for upload to the `gs://ria-hunter-data/raw-data/` bucket.
  2. In the Master KB, update the "Raw Data Files Inventory" to describe this file's role.
  3. Document that it links "FilingID" to "CIK".
  4. Emphasize that this is not adviser data, but a mapping table required for processing.
- **Rationale (≤225):** Preserves the raw data that enables the most important business rule (CRD↔CIK mapping). Uploading to GCS ensures the raw material for this linkage is archived and available for future reference.
- **Dependencies:** 2a
- **Vertex AI Note:** Explains the relationship between a "FilingID" and a "CIK". This helps the search understand the intermediate steps required to connect different SEC forms.

### 3a. src/lib/mapping/mappings.json
- **Directory Path:** /Users/turner/projects/ria-hunter/src/lib/mapping/
- **File Name:** mappings.json
- **Issue ID:** RH-09-19-25-3a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Field Normalization
- **File Summary (≤225):** A JSON file containing a dictionary that maps dozens of raw, messy field names from SEC filings to a clean, canonical schema. For example, it maps "Assets Under Management" and "Total AUM" to a single "aum" field.
- **Value Assessment (≤150):** This file represents significant domain knowledge by codifying the cleanup of inconsistent source data into a reliable, queryable schema.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Parse the JSON file to extract all key-value pairs representing the field mappings.
  2. Create a "Field Mappings" section in the Master KB.
  3. List the most important canonical fields (e.g., firm_name, crd_number, aum) and provide examples of the raw variations they map from.
  4. Reference the full list of 40+ mappings from the source file.
- **Rationale (≤225):** This knowledge is essential for query understanding. It allows Vertex AI to know that a user asking for "Total Assets" is looking for the same information as someone asking for "AUM," which is stored as `aum`.
- **Dependencies:** None
- **Vertex AI Note:** This is a synonym dictionary. It teaches the search that many different raw field names all refer to the same canonical concept, dramatically improving query flexibility.

### 3b. src/lib/mapping/validators.ts
- **Directory Path:** /Users/turner/projects/ria-hunter/src/lib/mapping/
- **File Name:** validators.ts
- **Issue ID:** RH-09-19-25-3b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Field Normalization
- **File Summary (≤225):** Contains the data validation and formatting rules for the canonical fields. This includes rules for required fields (e.g., firm_name), data types, and specific formats like E.164 for phone numbers and 2-letter state codes.
- **Value Assessment (≤150):** This file defines the data quality and consistency standards for the entire system. It ensures that all stored data adheres to a predictable and reliable format.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Read the file to identify all validation and formatting functions.
  2. Create a "Validation Rules" section in the Master KB.
  3. Document the list of required fields for a valid adviser profile.
  4. Detail the specific formatting rules for phone numbers, states, ZIP codes, and URLs.
  5. Mention the data type validations (e.g., CRD must be 1-8 digits).
- **Rationale (≤225):** Captures the data integrity rules. This information helps Vertex AI understand the expected format of data in the system, which can be used for both validation and for generating more accurate, well-formatted answers.
- **Dependencies:** 3a
- **Vertex AI Note:** Provides the schema definition and constraints. It tells the search engine the expected data type and format for each field, which is crucial for data quality and for formulating structured answers.

### 4a. app/api/ask/profile/[crd]/route.ts
- **Directory Path:** /Users/turner/projects/ria-hunter/app/api/ask/profile/[crd]/
- **File Name:** route.ts
- **Issue ID:** RH-09-19-25-4a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** This API endpoint aggregates all information for a given adviser profile based on their CRD number. It pulls together base data, fund information, and generates narratives, representing the final, user-facing data object.
- **Value Assessment (≤150):** Shows how all the disparate pieces of processed data are assembled into a single, coherent profile. It defines the "final product" of the data pipeline.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Analyze the endpoint's logic to understand what data sources it queries (e.g., adviser table, funds table).
  2. Document the structure of the final JSON object that is returned to the user.
  3. This defines the complete schema for a fully-formed "Adviser Profile."
  4. Add this schema to the "Entity Schemas" section of the Master KB, as it represents the fully aggregated view.
- **Rationale (≤225):** Defines the fully aggregated data model for an adviser. This is the schema Vertex AI should aim to populate when a user asks for complete information about a specific RIA, ensuring all relevant data points are included.
- **Dependencies:** 1a, 5a
- **Vertex AI Note:** This defines the schema of a complete answer. It shows the search what a full, aggregated adviser profile looks like, which can be used as a template for generating comprehensive results.

### 5a. scripts/build_narratives.py
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** build_narratives.py
- **Issue ID:** RH-09-19-25-5a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** This script contains the logic for generating human-readable summary narratives for each RIA. It also includes the classification rules for identifying fund types like "Venture Capital" or "Private Equity" based on keywords.
- **Value Assessment (≤150):** This is a key piece of business logic. It transforms structured data into natural language and codifies the domain-specific rules for classifying funds.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Extract the exact template used for narrative generation (e.g., "{firm_name} is an adviser in {city}...").
  2. Document the specific keywords used to classify funds as "Venture Capital" or "Private Equity".
  3. Add both the narrative template and the fund classification rules to the "Processing Rules" section of the Master KB.
  4. Note the input fields required for each rule.
- **Rationale (≤225):** Preserves two critical business rules: how to summarize an adviser's profile in natural language, and how to categorize their funds. This is high-level domain knowledge that is perfect for a RAG system.
- **Dependencies:** None
- **Vertex AI Note:** Teaches the search specific, valuable business rules: how to classify funds and how to construct a summary sentence. This allows it to answer questions like "Is this a VC fund?"

### 5b. scripts/load_to_supabase.py
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** load_to_supabase.py
- **Issue ID:** RH-09-19-25-5b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** This script handles the final step of the data pipeline: loading the processed and cleaned data into the Supabase database. It contains logic for handling upserts, managing relationships, and ensuring data integrity on load.
- **Value Assessment (≤150):** Reveals the database schema and data loading patterns, including how the system handles updates to existing records (e.g., "latest filing wins").
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Examine the script to identify the target database tables (e.g., `advisers`, `funds`).
  2. Document the primary keys and foreign keys used to establish relationships between tables.
  3. Extract the logic for handling data conflicts, such as the rule that the latest SEC filing overwrites older data for the same CRD.
  4. Add this to a "Data Quality Notes" section in the Master KB.
- **Rationale (≤225):** Captures the logic for data persistence and conflict resolution. The "latest filing wins" rule is a critical piece of domain knowledge for understanding how data is updated and maintained over time.
- **Dependencies:** All others
- **Vertex AI Note:** Explains the data lifecycle, especially how updates are handled. This helps the search understand that data is not static and that the most recent information should be prioritized.

### 6a. API_DOCUMENTATION.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** API_DOCUMENTATION.md
- **Issue ID:** RH-09-19-25-6a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Field Normalization
- **File Summary (≤225):** High-level documentation for the project's API. It likely contains descriptions of the canonical fields used in the final, aggregated adviser profiles, providing human-readable definitions for terms like "aum" and "crd_number".
- **Value Assessment (≤150):** Provides the "business definition" for the normalized fields, which is crucial context for the field mappings found in the JSON file.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Read the markdown file.
  2. For each field description found, cross-reference it with the canonical field names from `mappings.json`.
  3. In the Master KB, under the "Field Mappings" section, add the human-readable descriptions next to the canonical field names.
  4. This enriches the schema with semantic meaning, going beyond just the technical names.
- **Rationale (≤225):** Connects the technical, canonical field names (e.g., `aum`) to their plain-English business definitions ("Assets Under Management"). This semantic layer is vital for helping Vertex AI understand user queries accurately.
- **Dependencies:** 3a
- **Vertex AI Note:** This file acts as a glossary. It provides the plain-language definitions for the canonical fields, allowing the search to understand what `crd_number` or `is_3c1` actually means.

### 6b. API_ASK_MIGRATION_SUMMARY.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** API_ASK_MIGRATION_SUMMARY.md
- **Issue ID:** RH-09-19-25-6b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** This document likely details the architecture and data flow for the "ask" API, which seems to be the primary interface for querying adviser profiles. It probably explains how data moves from raw sources to the final aggregated endpoint.
- **Value Assessment (≤150):** Contains high-level architectural knowledge, explaining the "why" behind the data pipeline's structure and the relationships between different system components.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Read the document to extract any diagrams or descriptions of the system architecture.
  2. Summarize the key stages of the data pipeline it describes (e.g., Ingestion -> Normalization -> Aggregation -> Serving).
  3. Add a new "System Architecture" or "Data Flow" section to the Master KB to house this information.
  4. Note any mention of key technologies used (e.g., Supabase, Vercel).
- **Rationale (≤225):** Provides a bird's-eye view of how the system works. This architectural context helps Vertex AI understand not just individual rules, but how those rules fit together to create the final data product.
- **Dependencies:** 4a
- **Vertex AI Note:** This document provides a system-level overview. It explains the end-to-end data journey, which helps the search engine understand the context and provenance of the data it is querying.

### 7a. raw/ADV_Filing_Data_*/IA_Schedule_D_7B1_*.csv
- **Directory Path:** /Users/turner/projects/ria-hunter/raw/ADV_Filing_Data_*/
- **File Name:** IA_Schedule_D_7B1_*.csv
- **Issue ID:** RH-09-19-25-7a
- **Status:** 🔵 RAW DATA
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** Contains detailed information about the private funds managed by advisers. This includes fund type, gross asset value (GAV), and regulatory exemptions claimed (like 3(c)(1) or 3(c)(7)), linking back to the adviser via CRD.
- **Value Assessment (≤150):** This is the primary source for all private fund data, which is a core part of the project's value proposition. It enables the VC/PE detection and fund analysis.
- **Recommendation (≤100):** Upload to GCS
- **Suggested Actions (200-600):**
  1. Mark for upload to the `gs://ria-hunter-data/raw-data/` bucket.
  2. In the Master KB, add an entry for this file under "Raw Data Files Inventory."
  3. Document the key fields it contains: fund name, fund type, GAV, and exemption flags.
  4. Note that it links to the adviser entity via the adviser's CRD number.
- **Rationale (≤225):** Archives the raw data that feeds the business logic for fund classification and narrative enrichment. Preserving this source file is critical for understanding and validating the fund-related outputs of the system.
- **Dependencies:** 2a
- **Vertex AI Note:** This file defines the schema for a "Private Fund" entity. It tells the search what fields to expect for a fund, like its type and assets, and how it connects back to its parent adviser.

### 8a. src/lib/mapping/validation_notes.md
- **Directory Path:** /Users/turner/projects/ria-hunter/src/lib/mapping/
- **File Name:** validation_notes.md
- **Issue ID:** RH-09-19-25-8a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A markdown file likely containing human-readable explanations and business context for the validation rules implemented in `validators.ts`. It probably explains *why* certain fields are required or formatted in a specific way.
- **Value Assessment (≤150):** This provides the invaluable "why" behind the code. It captures the business rationale for data quality rules, which is pure domain knowledge.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. Read this markdown file and the `validators.ts` file side-by-side.
  2. For each validation rule in the code, find the corresponding explanation in this notes file.
  3. In the Master KB, under the "Validation Rules" section, add these explanations as context for each rule. For example, next to the "Phone E.164 format" rule, add the business reason why this is necessary.
- **Rationale (≤225):** While the code shows *what* rule is enforced, this document explains *why*. This rationale is critical for helping Vertex AI understand the intent behind the data structure, leading to more intelligent and context-aware answers.
- **Dependencies:** 3b
- **Vertex AI Note:** Provides the rationale behind the schema constraints. It explains *why* a phone number must be in a certain format, which helps the search engine understand and explain data quality requirements.

### 9a. scripts/parallel_fix_names.sh
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** parallel_fix_names.sh
- **Issue ID:** RH-09-19-25-9a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** A shell script that demonstrates a pattern for batch processing data files in parallel. This reveals a technique used in the data pipeline to handle large volumes of data efficiently by running multiple instances of a processing script.
- **Value Assessment (≤150):** While not containing direct domain logic, it reveals a critical operational pattern: the system is designed to process data in parallel, which speaks to the scale of the data.
- **Recommendation (≤100):** Extract Pattern
- **Suggested Actions (200-600):**
  1. Read the script to understand the command being parallelized (e.g., `xargs -P`).
  2. Note the pattern of piping a list of files into a parallel execution command.
  3. In the Master KB, under a "Data Pipeline" or "Processing Patterns" section, add a note about the use of parallel processing for large-scale data transformation, citing this script as the example.
- **Rationale (≤225):** Capturing this operational pattern provides context on how the raw data is handled at scale. This is a non-obvious piece of architectural knowledge that is valuable for understanding the full data lifecycle.
- **Dependencies:** None
- **Vertex AI Note:** This explains a processing pattern. It tells the search that data is handled in large, parallel batches, which provides context on the scale and nature of the data pipeline.

### 9b. SEMANTIC_SEARCH_FIX_INSTRUCTIONS.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** SEMANTIC_SEARCH_FIX_INSTRUCTIONS.md
- **Issue ID:** RH-09-19-25-9b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A document detailing fixes for a semantic search feature. It likely contains insights into what constitutes a "good" search result, the key fields that should be weighted, and the business logic behind the desired search behavior.
- **Value Assessment (≤150):** This captures the project's own definition of search relevance and quality. It contains invaluable knowledge about user intent and data importance for search.
- **Recommendation (≤100):** Extract Rules
- **Suggested Actions (200-600):**
  1. Read the document to identify the rules and heuristics for improving search results.
  2. Extract any notes on which fields are most important for search (e.g., "firm_name", "narrative").
  3. Document the "problems" and "solutions" described, as these reveal the underlying business requirements for the search feature.
  4. Add this to a "Search Logic" or "Relevance Rules" section in the Master KB.
- **Rationale (≤225):** This is a meta-knowledge source: it's not just about the data, but about how to *search* the data effectively. This is extremely valuable for tuning and validating the final Vertex AI Search application.
- **Dependencies:** None
- **Vertex AI Note:** This file defines what a "good" search result looks like. It provides rules and heuristics about search relevance that can be directly used to configure and test the Vertex AI Search app.

### 10a. supabase/migrations/20250804194421_create_ria_tables.sql
- **Directory Path:** /Users/turner/projects/ria-hunter/supabase/migrations/
- **File Name:** 20250804194421_create_ria_tables.sql
- **Issue ID:** RH-09-19-25-10a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** The foundational database schema definition. This SQL migration script creates the core `ria_profiles` and `narratives` tables, defining their columns, data types, and the primary/foreign key relationships between them.
- **Value Assessment (≤150):** This is the ground truth for the database structure. It provides the canonical, unambiguous schema for the core entities in the system.
- **Recommendation (≤100):** Extract Schema
- **Suggested Actions (200-600):**
  1. Read the SQL `CREATE TABLE` statements.
  2. In the Master KB, under "Entity Schemas," update the existing schemas with these exact definitions.
  3. Specify the precise data types (e.g., `bigint`, `text`, `numeric`, `vector(768)`).
  4. Document the `crd_number` as the `bigint primary key` and the foreign key relationship for the `narratives` table.
- **Rationale (≤225):** Extracts the definitive database schema directly from the source code. This is more reliable than inferring the schema from application code and provides the exact data model that Vertex AI needs to understand.
- **Dependencies:** None
- **Vertex AI Note:** This file provides the authoritative database schema. It tells the search engine the exact column names, data types, and relationships for the core `ria_profiles` table, which is the foundation of most queries.

### 10b. supabase/migrations/20250804200000_add_private_placement_data.sql
- **Directory Path:** /Users/turner/projects/ria-hunter/supabase/migrations/
- **File Name:** 20250804200000_add_private_placement_data.sql
- **Issue ID:** RH-09-19-25-10b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** Reveals a key architectural decision: private fund data is denormalized. Instead of a separate table, aggregate fields (`private_fund_count`, `private_fund_aum`) are added directly to the `ria_profiles` table for performance.
- **Value Assessment (≤150):** This is critical architectural knowledge. It explains the data model for private funds and the design choice to prioritize query speed over data normalization.
- **Recommendation (≤100):** Extract Schema
- **Suggested Actions (200-600):**
  1. Read the `ALTER TABLE` statement.
  2. In the Master KB's "Entity Schemas" for `Adviser Entity`, add the denormalized columns: `private_fund_count (integer)` and `private_fund_aum (numeric)`.
  3. Add a "Data Quality Note" explaining this denormalization and that the source is "Schedule D 7.B(1) analysis," as stated in the SQL comments.
- **Rationale (≤225):** Captures a non-obvious but vital aspect of the data model. Understanding this denormalization is essential for Vertex AI to correctly interpret queries about private funds and to understand the adviser profile schema.
- **Dependencies:** 10a
- **Vertex AI Note:** Explains a performance optimization in the schema. It tells the search that private fund data is pre-aggregated on the adviser profile, meaning it doesn't need to perform a separate join to answer questions about fund counts or AUM.

### 11a. src/docai/README.md
- **Directory Path:** /Users/turner/projects/ria-hunter/src/docai/
- **File Name:** README.md
- **Issue ID:** RH-09-19-25-11a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** This document outlines a complete, modern data ingestion pipeline using Google Document AI to process SEC forms. It details the steps (Fetch, Process, Normalize, Store) and provides a detailed database schema that differs from the migrations.
- **Value Assessment (≤150):** Extremely high value. It reveals a sophisticated, alternative data processing architecture and a more detailed entity schema, which may represent a newer system design.
- **Recommendation (≤100):** Extract Pipeline & Schema
- **Suggested Actions (200-600):**
  1. Read the README to understand the four-stage pipeline architecture.
  2. Document this "Document AI Pipeline" in the Master KB, including the roles of `fetcher`, `processor`, `normalizer`, and `storage`.
  3. Extract the detailed `ria_profiles` schema from the README.
  4. In the Master KB, add this as an "Alternative Schema" or "DocAI Schema" to contrast with the one from the migrations, noting the differences (UUID key, additional fields).
- **Rationale (≤225):** Captures a complete, end-to-end data processing architecture and an alternative, potentially more current, data schema. This is a massive piece of hidden knowledge that is critical for understanding the full scope of the project.
- **Dependencies:** None
- **Vertex AI Note:** This reveals a completely different data ingestion method using modern AI tools. It also provides a more detailed adviser schema, which can be used to enrich the knowledge base's understanding of what constitutes a complete adviser profile.

### 12a. supabase/migrations/20250813000000_add_compute_vc_activity.sql
- **Directory Path:** /Users/turner/projects/ria-hunter/supabase/migrations/
- **File Name:** 20250813000000_add_compute_vc_activity.sql
- **Issue ID:** RH-09-19-25-12a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A SQL function that contains the core business logic for identifying and ranking Venture Capital firms. It defines the keywords for fund classification, a weighted "activity score," and joins adviser, fund, and executive data.
- **Value Assessment (≤150):** Extremely high. This is the "secret sauce" of the project's VC analysis, containing the precise, quantifiable rules that define a firm's level of VC activity.
- **Recommendation (≤100):** Extract Rules
- **Suggested Actions (200-600):**
  1. Read the SQL function to extract the VC fund detection keywords (`%venture%`, `%vc%`, `%startup%`).
  2. Document the exact weighted formula for the `activity_score`.
  3. Note the join logic, showing that `ria_profiles`, `ria_private_funds`, and `control_persons` tables are used to build the final result.
  4. Add these rules to the "Business Logic" section of the Master KB.
- **Rationale (≤225):** Captures the most valuable and complex piece of business logic in the entire database. This is not just data, but the operational intelligence that interprets the data. This is exactly what Vertex AI needs to learn.
- **Dependencies:** 10a
- **Vertex AI Note:** This provides the algorithm for ranking VC firms. It teaches the search not just *what* a VC fund is, but *how to quantify and compare* the VC activity of different firms, enabling much more sophisticated queries.

### 13a. Docs/Final_Refactor_Backend_Plan_v2_22-Aug-2025.md
- **Directory Path:** /Users/turner/projects/ria-hunter/Docs/
- **File Name:** Final_Refactor_Backend_Plan_v2_22-Aug-2025.md
- **Issue ID:** RH-09-19-25-13a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** The strategic blueprint for the entire backend. It details the critical performance issues (1.8s queries), data gaps (60% narratives missing), and architectural flaws (wrong vector dimensions) that motivated the project's refactor.
- **Value Assessment (≤150):** The most valuable document for understanding the "why" behind the architecture. It contains the project's entire technical strategy, rationale, and goals.
- **Recommendation (≤100):** Extract Strategy
- **Suggested Actions (200-600):**
  1. Read the "Executive Overview" to understand the core problems.
  2. Document the "Target Architecture," including the goals of using native pgvector, hybrid search, and a robust ETL pipeline.
  3. Extract the specific rationale for choosing the IVFFlat index over HNSW based on dataset size.
  4. Add this strategic context to a "System Architecture" section in the Master KB.
- **Rationale (≤225):** Captures the highest-level strategic knowledge. It explains the problems, the goals, and the technical decisions made to solve them. This context is essential for Vertex AI to understand the *purpose* of the data and rules.
- **Dependencies:** All others
- **Vertex AI Note:** This is the project's mission statement. It explains the *why* behind the entire architecture, providing invaluable context that allows the search to understand not just the rules, but the problems those rules were designed to solve.

### 14a. seed/ria_profiles.csv
- **Directory Path:** /Users/turner/projects/ria-hunter/seed/
- **File Name:** ria_profiles.csv
- **Issue ID:** RH-09-19-25-14a
- **Status:** 🔵 RAW DATA
- **Knowledge Domain:** Raw Data Schema
- **File Summary (≤225):** The raw, original seed data for RIA profiles. Crucially, its schema is much wider and more detailed than the final database table, containing valuable fields like `services`, `client_types`, and `is_registered`.
- **Value Assessment (≤150):** Extremely high. It reveals the "ground truth" schema of the source data before simplification, exposing a wealth of untapped fields perfect for a rich RAG implementation.
- **Recommendation (≤100):** Upload to GCS
- **Suggested Actions (200-600):**
  1. Mark this file for upload to the `gs://ria-hunter-data/raw-data/` bucket.
  2. In the Master KB, create a new "Source Schema" section under "Entity Schemas" to document the full, wide schema from this CSV's header.
  3. Note the discrepancy between this source schema and the simplified database schema, highlighting the dropped fields as an opportunity for enrichment in Vertex AI.
- **Rationale (≤225):** Preserves the original, complete data schema. This knowledge is vital for Vertex AI Search, as it allows the RAG system to draw from a much richer set of fields than the final database, leading to more detailed and accurate answers.
- **Dependencies:** None
- **Vertex AI Note:** This file provides a richer, more detailed schema than the database. It contains numerous additional fields (like `services` and `client_types`) that can be used to answer a much wider range of user questions.

### 15a. output/FINAL_ANALYSIS_SUMMARY.md
- **Directory Path:** /Users/turner/projects/ria-hunter/output/
- **File Name:** FINAL_ANALYSIS_SUMMARY.md
- **Issue ID:** RH-09-19-25-15a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** The final output of a major analytical task. It identifies the top RIAs for private placements in St. Louis and details the precise methodology used, including data sources, geographic filtering, and ranking criteria.
- **Value Assessment (≤150):** Extremely high. It provides a concrete example of the end-to-end business intelligence the system is designed to produce, from raw data to final, actionable insights.
- **Recommendation (≤100):** Extract Insights & Methodology
- **Suggested Actions (200-600):**
  1. Read the "Analysis Methodology" section to extract the business rules for ranking firms (primary metric: fund count, secondary: AUM).
  2. Document the specific geographic filtering rules, including handling variations like "ST. LOUIS" and "SAINT LOUIS".
  3. Note the data quality finding about needing `latin-1` encoding for CSVs.
  4. In the Master KB, use this as a prime example of a target "answer" the RAG system should be able to generate.
- **Rationale (≤225):** Captures the project's "final product" in a narrative form. This is invaluable for Vertex AI, as it provides a template for what a high-quality, comprehensive answer to a complex business query looks like.
- **Dependencies:** None
- **Vertex AI Note:** This document provides a perfect template for a high-quality answer. It shows the search engine how to structure a response to a complex query, including rankings, methodology, and notable findings.

### 16a. ChatGPT_Master_AI_plan_25_August_2025.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** ChatGPT_Master_AI_plan_25_August_2025.md
- **Issue ID:** RH-09-19-25-16a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A master plan detailing two critical backend refactoring efforts: making Stripe webhooks reliable for managing paid subscriptions, and migrating the database from JSON string embeddings to a native pgvector format for performance.
- **Value Assessment (≤150):** Extremely high. This document contains the core business logic for monetization (Stripe subscriptions) and the foundational technical strategy for the semantic search feature.
- **Recommendation (≤100):** Extract
- **Suggested Actions (200-600):**
  1. In the Master KB, create a new "Business Logic" section for "Subscription Management".
  2. Document the Stripe webhook events handled: `customer.subscription.*` and `checkout.session.completed`.
  3. Note the key outcome: the system sets an `is_subscriber` flag in the database.
  4. In "Data Quality Notes", add a section on the vector migration, mentioning the conversion of 41,303 narratives to 768-dimensional vectors.
- **Rationale (≤225):** Captures two previously unknown, high-value systems. The subscription logic is essential for understanding user entitlements, and the vector migration details are critical for understanding the mechanics of the semantic search feature.
- **Dependencies:** None
- **Vertex AI Note:** This file explains how the application identifies paying subscribers (`is_subscriber` flag). This allows the search system to understand user permissions and entitlements, which is critical context for query handling.

### 16b. BACKEND_API_DOCUMENTATION.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** BACKEND_API_DOCUMENTATION.md
- **Issue ID:** RH-09-19-25-16b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** The definitive documentation for all backend API endpoints. It provides the exact request/response schemas for core functions like `/api/ask` and `/api/session/status`, including details on session tracking and error handling.
- **Value Assessment (≤150):** Extremely high. This document provides the canonical schema for the 'final product' of the entire data pipeline – the fully aggregated JSON object served to the user.
- **Recommendation (≤100):** Extract Schemas
- **Suggested Actions (200-600):**
  1. In the Master KB, update the "Entity Schemas" section for the "Adviser Entity".
  2. Use the response structure from the `/api/ask` endpoint as the ground truth for the fully aggregated adviser profile, including nested executive data.
  3. Add a new "Business Logic" section for "Demo Session Management," documenting the `rh_demo` cookie and the 5-search limit for non-subscribers.
- **Rationale (≤225):** Provides a perfect, developer-verified template for what constitutes a complete and well-formed answer. This allows Vertex AI to structure its responses in the exact format the consuming application expects, ensuring consistency.
- **Dependencies:** None
- **Vertex AI Note:** This document provides the ideal answer format. It gives the search system a precise JSON schema to target when generating answers, ensuring the output is structured, complete, and immediately useful to the frontend application.

### 17a. TIMEOUT_AND_INDEX_SOLUTION.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** TIMEOUT_AND_INDEX_SOLUTION.md
- **Issue ID:** RH-09-19-25-17a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** Explains the resolution for critical database timeout issues. It details the "before and after" performance impact of adding specific database indexes and clarifies that indexing was the correct, permanent solution to the problem.
- **Value Assessment (≤150):** This captures the core performance tuning strategy for the database. It explains *why* the system can performantly query a 100k+ record table.
- **Recommendation (≤100):** Extract Strategy
- **Suggested Actions (200-600):**
  1. In the Master KB, create a new "System Architecture" section titled "Performance & Indexing Strategy".
  2. Document the key indexes created: Geographic (city/state), AUM, Fund Type, and Text Search for handling variations like "ST LOUIS".
  3. Note the performance improvement: queries that previously timed out now execute in under 100ms.
  4. This provides the "why" behind the system's responsiveness.
- **Rationale (≤225):** Preserves the hard-won knowledge about database optimization. This is a critical architectural pattern that explains how the system achieves its speed and reliability, a key piece of context for the AI.
- **Dependencies:** None
- **Vertex AI Note:** This file explains *how* the database is so fast. It details the specific indexing strategies that allow for sub-100ms queries on large datasets, providing crucial context for understanding query performance.

### 17b. VERTEX_AI_SETUP_GUIDE.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** VERTEX_AI_SETUP_GUIDE.md
- **Issue ID:** RH-09-19-25-17b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** System Architecture
- **File Summary (≤225):** A setup guide for configuring the project to use Google Vertex AI. It details the required environment variables and specifies the correct model names for generation (`gemini-pro`) and embeddings (`textembedding-gecko`).
- **Value Assessment (≤150):** Provides the canonical technical specifications for the project's AI provider. It contains the exact model names and embedding dimensions, which are critical details.
- **Recommendation (≤100):** Extract Configuration
- **Suggested Actions (200-600):**
  1. In the "System Architecture" section of the Master KB, add a subsection for "Vertex AI Configuration".
  2. Document that the `AI_PROVIDER` environment variable must be set to `vertex`.
  3. Note the specific model names used: `gemini-pro` for generation and `textembedding-gecko` for embeddings (768 dimensions).
  4. List the required Google Cloud environment variables.
- **Rationale (≤225):** Captures the definitive configuration for the project's AI services. This ensures that the system is set up correctly and consistently, using the approved models and settings for all AI-powered features.
- **Dependencies:** None
- **Vertex AI Note:** This explains the system's AI layer configuration. It provides the precise model names (`gemini-pro`, `textembedding-gecko`) and embedding dimensionality (768), which are fundamental details for the search system to function correctly.

### 18a. CREDITS_SYSTEM.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** CREDITS_SYSTEM.md
- **Issue ID:** RH-09-19-25-18a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** Documents a formal, database-backed credits system for authenticated users. It details the schema for `user_accounts` and `credit_transactions` tables and the stored procedures (`add_credits`, `deduct_credits`) for managing user balances.
- **Value Assessment (≤150):** Reveals a sophisticated user entitlement system beyond simple subscriptions or demo limits. The transactional nature provides a full audit trail of a user's activity.
- **Recommendation (≤100):** Extract Schema & Logic
- **Suggested Actions (200-600):**
  1. In the Master KB's "Entity Schemas", add schemas for `user_accounts` and `credit_transactions`.
  2. In the "Business Logic" section, add a subsection for "User Credits System".
  3. Document the logic: users have a `balance` which is modified by idempotent transactions from various sources ('purchase', 'grant', 'subscription').
  4. Note the default credit amounts (`ANONYMOUS_FREE_CREDITS`).
- **Rationale (≤225):** Captures a core part of the business model that was previously undocumented. This system is key to understanding user value, entitlements, and activity, which is vital context for the AI.
- **Dependencies:** None
- **Vertex AI Note:** This file explains the formal user credit system. It tells the search engine that beyond being a subscriber or not, users have a quantifiable `balance` of credits, which is a key piece of information for understanding a user's status and permissions.

### 18b. Vector Migration Notes (from ChatGPT_Master_AI_plan_25_August_2025.md)
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** ChatGPT_Master_AI_plan_25_August_2025.md
- **Issue ID:** RH-09-19-25-18b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Quality
- **File Summary (≤225):** Contains the operational notes from the migration of 41,303 embeddings to a native vector format. It highlights critical findings, such as the correct embedding dimension being 768 (not 384) and the need to process in batches to avoid tool timeouts.
- **Value Assessment (≤150):** Extremely high. This captures the practical, hard-won knowledge from a major data engineering task. The "768 vs 384" dimension finding is a critical data quality fact.
- **Recommendation (≤100):** Extract Notes
- **Suggested Actions (200-600):**
  1. In the Master KB, create a "Data Quality Notes" section.
  2. Add a note specifying that the correct vector dimension for embeddings is 768.
  3. Add a note under "Processing Patterns" about the operational constraint of Supabase SQL Editor timeouts, requiring large operations to be batched (e.g., 5,000 records at a time).
  4. Note the need for HNSW indexing for performance.
- **Rationale (≤225):** Preserves crucial "in the trenches" knowledge that prevents future errors. Understanding the correct vector dimensions is fundamental to the search logic, and the batching pattern is a key piece of operational wisdom.
- **Dependencies:** None
- **Vertex AI Note:** This provides the ground-truth about the data's structure. Knowing the embeddings are 768 dimensions is a non-negotiable prerequisite for the search system to function correctly. The batching insight explains the data processing workflow.

### 19a. APPLY_INDEXES_INSTRUCTIONS.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** APPLY_INDEXES_INSTRUCTIONS.md
- **Issue ID:** RH-09-19-25-19a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** Provides a step-by-step, copy-paste SQL script for applying all necessary database indexes to resolve performance timeouts. It includes instructions for running the script in the Supabase SQL Editor and verifying the results.
- **Value Assessment (≤150):** Contains the exact, actionable procedure for implementing the system's core performance optimization. This is a critical piece of operational knowledge.
- **Recommendation (≤100):** Extract Procedure
- **Suggested Actions (200-600):**
  1. In the Master KB, under the "Performance & Indexing Strategy" section, add a subsection titled "Implementation Procedure".
  2. Document the high-level steps: open the Supabase SQL Editor, paste the script, and run it.
  3. Note that the script is idempotent (safe to run multiple times) and includes commands to enable necessary extensions like `pg_trgm` and analyze tables.
- **Rationale (≤225):** Preserves the exact "how-to" for a critical operational task. This ensures that the performance fixes can be reliably and repeatedly applied, which is essential for system maintenance and disaster recovery.
- **Dependencies:** 17a
- **Vertex AI Note:** This document provides the operational playbook for ensuring the database is performant. It's a set of instructions that, if followed, guarantee the data backend can support the fast queries needed by the search system.

### 20a. scripts/identify_top_stl_ria_final.py
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** identify_top_stl_ria_final.py
- **Issue ID:** RH-09-19-25-20a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** The final, operational script for producing a key business intelligence report: identifying the top RIAs in St. Louis for private placements. It contains the complete, end-to-end logic from raw data loading to the final ranked output.
- **Value Assessment (≤150):** Extremely high. This script is a perfect, self-contained example of the system's analytical capabilities, revealing data quality workarounds and the final ranking methodology.
- **Recommendation (≤100):** Extract Methodology
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Business Logic", add a new example: "Ranking RIAs for Private Placements".
  2. Document the specific data sources: `IA_Schedule_D_7B1` (funds) and `IA_ADV_Base_A` (advisers).
  3. Note the data quality rule for handling geographic variations (`ST. LOUIS`, `ST LOUIS`, `SAINT LOUIS`).
  4. Extract the ranking algorithm: Primary sort on `num_private_funds` (desc), secondary sort on `total_gross_assets` (desc).
- **Rationale (≤225):** Captures a complete, tangible example of how the project delivers value. This is not just a rule, but a full methodology that provides an ideal template for how the Vertex AI system should answer complex, location-based ranking queries.
- **Dependencies:** None
- **Vertex AI Note:** This script provides a perfect template for answering a complex analytical query. It shows the search system the exact steps: identify location, handle variations, join data sources, aggregate results, and apply a multi-level sort to produce a final, ranked list.

### 20b. scripts/create_advanced_search_functions.sql
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** create_advanced_search_functions.sql
- **Issue ID:** RH-09-19-25-20b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A SQL script that defines the database functions for advanced search. It includes a standard vector search, functions to retrieve related data like executives and funds, and, most importantly, a `hybrid_search_rias` function.
- **Value Assessment (≤150):** Extremely high. It reveals the "secret sauce" of the search algorithm: a hybrid approach that combines vector similarity with traditional text search using a weighted score.
- **Recommendation (≤100):** Extract Search Algorithm
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Business Logic," create a new section called "Hybrid Search Algorithm".
  2. Document the formula for the `combined_score`: `(vector_similarity * 0.7) + (text_match_rank * 0.3)`.
  3. Note that this combines semantic relevance (vectors) with keyword matching (text search) to produce a more robust final ranking.
  4. Also, document the supporting functions like `get_firm_executives` and `get_firm_private_funds`.
- **Rationale (≤225):** Captures the core intellectual property of the search relevance strategy. This is the single most important piece of business logic for the Vertex AI system to understand, as it defines what a "good" search result is.
- **Dependencies:** 12a
- **Vertex AI Note:** This file defines the core search ranking algorithm. It tells the search system to not rely on vector similarity alone, but to blend it with keyword-based text search to produce a final, more accurate `combined_score`. This is the definition of relevance.

### 20c. scripts/audit_missing_fields.js
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** audit_missing_fields.js
- **Issue ID:** RH-09-19-25-20c
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Quality
- **File Summary (≤225):** A data auditing script that programmatically defines data completeness for an RIA profile. It checks a specific list of key fields for `NULL`, empty string, and zero values to calculate a "missing fields" percentage for each.
- **Value Assessment (≤150):** Contains the explicit business rule for what constitutes a "high-quality" adviser profile. This is a foundational piece of data governance knowledge.
- **Recommendation (≤100):** Extract Quality Rules
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Data Quality Notes," create a new section called "Profile Completeness Rules".
  2. List the key fields that are audited for completeness: `legal_name`, `city`, `state`, `aum`, `phone`, `website`, `cik`, and `form_adv_date`.
  3. Document the rule that a field is considered "missing" if its value is `NULL`, an empty string (`''`), or the number `0`.
- **Rationale (≤225):** Captures the project's formal definition of data quality. This is critical for the AI, as it provides a clear set of criteria for evaluating the reliability and completeness of the data it is searching.
- **Dependencies:** None
- **Vertex AI Note:** This script provides the definition of a "good" data record. It gives the search system a checklist of essential fields (`legal_name`, `aum`, etc.) and the specific conditions under which a field should be considered missing, which is crucial for assessing data quality at query time.

### 20d. scripts/check_data_completeness.js
- **Directory Path:** /Users/turner/projects/ria-hunter/scripts/
- **File Name:** check_data_completeness.js
- **Issue ID:** RH-09-19-25-20d
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Quality
- **File Summary (≤225):** A high-level data validation script that checks for consistency between raw source files and the database. It verifies that the number of RIA profiles in the database is consistent with the raw `IA_ADV_Base` files and checks for missing narratives.
- **Value Assessment (≤150):** Contains the business rule that defines a "complete" dataset: the database should reflect the raw data, and all profiles should have an associated narrative.
- **Recommendation (≤100):** Extract Validation Rules
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Data Quality Notes," add a section titled "Dataset Validation Rules".
  2. Document the rule that the count of `ria_profiles` in the database should correspond to the row counts in the `IA_ADV_Base_A` and `IA_ADV_Base_B` source files.
  3. Add the critical rule that every record in `ria_profiles` should have a corresponding entry in the `narratives` table.
- **Rationale (≤225):** Captures the project's macro-level data integrity checks. This ensures that the AI understands the expected state of a fully processed, high-quality dataset, including the critical narrative enrichment step.
- **Dependencies:** None
- **Vertex AI Note:** This script explains what a "complete" dataset looks like. It tells the search system that every adviser profile should have a narrative, which is a key expectation for data quality and for the richness of the searchable content.

### 21a. logs/corrected_embedding_generation.log
- **Directory Path:** /Users/turner/projects/ria-hunter/logs/
- **File Name:** corrected_embedding_generation.log
- **Issue ID:** RH-09-19-25-21a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Quality
- **File Summary (≤225):** A log file from the embedding generation process that reveals a systemic, critical failure. It shows that the process repeatedly failed for numerous CRDs with an `embeddingModel.predict is not a function` error, even after 3 retry attempts.
- **Value Assessment (≤150):** Extremely high. This log provides concrete evidence of a major data quality issue in the pipeline, indicating that a significant number of narratives are likely missing embeddings.
- **Recommendation (≤100):** Extract Failure Pattern
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Data Quality Notes," create a new critical section called "Embedding Generation Failures".
  2. Document the specific error message: `embeddingModel.predict is not a function`.
  3. Note that the ETL process includes a retry mechanism (3 attempts), but that this error was persistent and caused final failure for many records.
  4. This highlights a significant gap in data completeness for the core semantic search feature.
- **Rationale (≤225):** Captures a latent but critical data integrity problem. This knowledge is essential for the Vertex AI project, as it explains potential gaps in search results and highlights the need to re-process and verify the embeddings before deployment.
- **Dependencies:** None
- **Vertex AI Note:** This log reveals a critical data gap. It tells the search system that a potentially large number of adviser narratives are missing the vector embeddings required for semantic search, which will directly impact the quality and completeness of search results.

### 21b. logs/fund_classification_2025-09-09.log
- **Directory Path:** /Users/turner/projects/ria-hunter/logs/
- **File Name:** fund_classification_2025-09-09.log
- **Issue ID:** RH-09-19-25-21b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A log file that reveals a dynamic, rule-based fund reclassification process. It shows the system actively cleaning up fund data by reclassifying funds from generic categories (e.g., "Special Situations Fund") to more specific ones.
- **Value Assessment (≤150):** High. This log contains implicit business logic about fund categorization that is not documented elsewhere. It's a real-world example of data enrichment in action.
- **Recommendation (≤100):** Extract Reclassification Rules
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Business Logic," create a new section called "Fund Reclassification Rules".
  2. Document the observed pattern: fund names containing "Special Situations" are re-categorized based on other keywords.
  3. Example Rule 1: If name also contains "Opportunities", reclassify to "Private Equity (Buyout)".
  4. Example Rule 2: If name also contains "Advantage" or "Alpha", reclassify to "Alternative Investment".
- **Rationale (≤225):** Preserves a hidden, dynamic data enrichment rule. This type of implicit knowledge is incredibly valuable for the AI, as it teaches it the nuances of how the raw data is cleaned and interpreted to produce higher-quality results.
- **Dependencies:** None
- **Vertex AI Note:** This log teaches the system about data curation. It shows that raw fund types are not always trusted and that a set of heuristics is applied to reclassify them into more meaningful categories, improving the quality of the data.

### 22a. SEMANTIC_SEARCH_COMPLETION_REPORT.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** SEMANTIC_SEARCH_COMPLETION_REPORT.md
- **Issue ID:** RH-09-19-25-22a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Business Logic
- **File Summary (≤225):** A report detailing the successful fix of the semantic search feature. It confirms the move from "fake" text matching to "true" vector search, the 180x performance improvement (<10ms), and provides data coverage numbers (105k embeddings).
- **Value Assessment (≤150):** Extremely high. Provides the "after" picture for the performance work and, most importantly, a concrete example of what "true" semantic search means for this project.
- **Recommendation (≤100):** Extract Metrics & Examples
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Performance & Indexing Strategy," add the final performance metric: search times improved from 1800ms to <10ms.
  2. Under "Business Logic," create a section called "Semantic Search Capabilities".
  3. Add the key example: a query for "alternative investment strategies" correctly returns conceptually similar results like "Hedge fund management" and "Venture capital".
- **Rationale (≤225):** Preserves the definition and success criteria for the project's core feature. The concrete example of semantic relevance is one of the most valuable pieces of knowledge for teaching the AI how to interpret user intent.
- **Dependencies:** 17a, 19a
- **Vertex AI Note:** This document provides the definition of a successful semantic search. The example of "alternative investment strategies" is a perfect illustration of user intent vs. literal keywords, which is a core concept the search system must understand to be effective.

### 22b. API_ROUTING_CONSOLIDATION.md & MIGRATION_NOTES.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** API_ROUTING_CONSOLIDATION.md
- **Issue ID:** RH-09-19-25-22b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** System Architecture
- **File Summary (≤225):** Historical documents explaining a critical architectural decision: the deprecation and removal of a confusing `/_backend/api/*` path structure in favor of a single, standard Next.js `/api/*` routing scheme.
- **Value Assessment (≤150):** High. This captures the "don't do this" institutional knowledge that prevents repeating past architectural mistakes, ensuring consistency and maintainability.
- **Recommendation (≤100):** Extract Architectural Rule
- **Suggested Actions (200-600):**
  1. In the Master KB, under "System Architecture," create a section called "API Routing".
  2. Document the single, canonical rule: "All API endpoints must use the standard `/api/*` path structure."
  3. Add a note that the `/_backend/api/*` path is deprecated, has been removed, and should not be used in any new development.
- **Rationale (≤225):** Preserves a hard-won architectural lesson. By explicitly documenting this rule, we prevent future developers or AI agents from re-introducing complexity and ensure the codebase remains clean and consistent.
- **Dependencies:** None
- **Vertex AI Note:** This provides a canonical rule for API structure. It tells the search system that there is only one valid path for API endpoints (`/api/*`), which eliminates ambiguity when interpreting code or documentation that might reference older, deprecated paths.

### 22c. BACKEND_FIXES_SUMMARY.md
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** BACKEND_FIXES_SUMMARY.md
- **Issue ID:** RH-09-19-25-22c
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** System Architecture
- **File Summary (≤225):** A summary of production-hardening fixes. It details the implementation of a circuit breaker pattern (`opossum`) for AI service resilience, secure credential handling using Base64, and an advanced query planner using Gemini Function Calling.
- **Value Assessment (≤150):** Extremely high. This captures the sophisticated, non-obvious architecture that ensures the system is resilient, secure, and intelligent in how it interprets user queries.
- **Recommendation (≤100):** Extract Resilience & AI Patterns
- **Suggested Actions (200-600):**
  1. In the Master KB, create a "System Architecture" section for "AI Service Resilience". Document the use of the `opossum` circuit breaker with its 2.5s timeout and graceful degradation to a context-only response.
  2. Add a "Security" note about the use of `GCP_SA_KEY_BASE64` for credential management.
  3. Under "Business Logic", add a "Query Decomposition" section explaining the use of Gemini Function Calling (`planner-v2.ts`) to extract structured filters from natural language queries.
- **Rationale (≤225):** Preserves the advanced architectural patterns that make the system production-ready. The circuit breaker, security measures, and intelligent query planner are critical pieces of knowledge that define the system's operational excellence.
- **Dependencies:** None
- **Vertex AI Note:** This document explains the system's advanced intelligence and resilience. It tells the search system how it gracefully handles AI service failures (circuit breaker) and, more importantly, how it uses Gemini Function Calling to deconstruct user queries into structured, searchable components (e.g., extracting "St. Louis" into `city` and `state` filters).

### 22d. vercel.json
- **Directory Path:** /Users/turner/projects/ria-hunter/
- **File Name:** vercel.json
- **Issue ID:** RH-09-19-25-22d
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** System Architecture
- **File Summary (≤225):** The Vercel deployment configuration file. It specifies a global `maxDuration` of 30 seconds for all serverless API functions, establishing the hard timeout limit for any API request in the production environment.
- **Value Assessment (≤150):** High. This contains a critical, non-negotiable operational constraint of the production environment. All application logic must execute within this 30-second window.
- **Recommendation (≤100):** Extract Operational Constraint
- **Suggested Actions (200-600):**
  1. In the Master KB, under "System Architecture," create a section called "Operational Constraints".
  2. Document the rule: "All serverless functions deployed on Vercel have a maximum execution duration of 30 seconds."
  3. Note that this is a hard limit imposed by the hosting environment and influences the design of all long-running processes.
- **Rationale (≤225):** Preserves a fundamental environmental constraint that governs all application design. Understanding this timeout is critical for designing ETL processes, API endpoints, and any other server-side logic to be resilient and efficient.
- **Dependencies:** None
- **Vertex AI Note:** This file provides a critical performance constraint. It tells the search system that any query or data processing task triggered via an API call must complete within 30 seconds, which is the hard limit of the entire system's serverless architecture.

### 23a. Docs/Credit_Overhaul_&_Executive_Enrichment_Backend_Plan_27-Aug-2025.md
- **Directory Path:** /Users/turner/projects/ria-hunter/Docs/
- **File Name:** Credit_Overhaul_&_Executive_Enrichment_Backend_Plan_27-Aug-2025.md
- **Issue ID:** RH-09-19-25-23a
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** System Architecture
- **File Summary (≤225):** A strategic plan detailing a major architectural pivot: the complete removal of the complex, database-backed credits system in favor of a simpler, cookie-based demo session. It also outlines the plan to enrich search results with executive data.
- **Value Assessment (≤150):** Foundational. This document explains the "why" behind the current, simplified user session model and provides the historical context that the more complex system was a failed path.
- **Recommendation (≤100):** Extract Architectural Decision
- **Suggested Actions (200-600):**
  1. In the Master KB, update the "User Credits System" and "Demo Session Management" sections to reflect this change.
  2. Add a historical note: "A previous, more complex credit system was deprecated and removed in favor of a simple, cookie-based demo session for non-subscribers."
  3. Document the current rule: Non-subscribers get 5 free searches tracked in the `rh_demo` cookie.
  4. Add the executive enrichment rule: Search results are enriched with up to 5 executives from the `control_persons` table.
- **Rationale (≤225):** Captures a major architectural decision and the reasoning behind it. This prevents future confusion and ensures the AI understands that the simpler session model is the current, correct implementation, not an incomplete feature.
- **Dependencies:** 18a
- **Vertex AI Note:** This document provides critical historical context and the current ground truth for user session management. It tells the search system to ignore any legacy information about a complex credits system and to understand that the simple 5-search demo cookie is the correct implementation. It also defines the rule for adding executive data to search results.

### 23b. src/docai/README.md
- **Directory Path:** /Users/turner/projects/ria-hunter/src/docai/
- **File Name:** README.md
- **Issue ID:** RH-09-19-25-23b
- **Status:** 🟡 IN PROGRESS
- **Knowledge Domain:** Data Pipeline
- **File Summary (≤225):** Documentation for a complete, modern data ingestion pipeline that uses Google Document AI. It outlines a four-stage process (Fetch, Process, Normalize, Store) for automatically ingesting SEC forms and loading them into Supabase.
- **Value Assessment (≤150):** Extremely high. This reveals a sophisticated, and likely more current, data processing architecture that represents a significant piece of the project's engineering.
- **Recommendation (≤100):** Extract Pipeline Architecture
- **Suggested Actions (200-600):**
  1. In the Master KB, under "Data Pipeline," create a new section called "Document AI Ingestion Pipeline".
  2. Document the four stages: Fetch (from SEC EDGAR), Process (with Vertex AI DocAI), Normalize (clean fields), and Store (upsert to Supabase).
  3. Add the alternative, more detailed `ria_profiles` schema from this README to the "Entity Schemas" section, noting that it may be a more current or ideal version.
- **Rationale (≤225):** Captures a complete, end-to-end modern ETL process that was previously unknown. This is a massive piece of architectural knowledge that provides a more complete picture of the project's data engineering capabilities and future direction.
- **Dependencies:** None
- **Vertex AI Note:** This document reveals a sophisticated, automated data ingestion process. It tells the search system about a structured, multi-stage pipeline for processing raw documents into clean, queryable data, providing deep context on the provenance and quality of the information in the database.

## Item Template
### [ID] Path
- **Directory Path:** /absolute/path/to/
- **File Name:** filename.ext
- **Issue ID:** RH-09-19-25-[ID]
- **Status:** 🔴/🟡/🟢/❌/⏸️/🔵
- **Knowledge Domain:** [Domain from list above]
- **File Summary (≤225):** What this file/data does
- **Value Assessment (≤150):** Why this matters for Vertex AI Search
- **Recommendation (≤100):** Extract/Archive/Upload/Defer
- **Suggested Actions (200-600):**
  1. Step-by-step extraction plan
  2. What sections go in Master KB
  3. Dependencies to include
- **Rationale (≤225):** Why this approach preserves maximum value
- **Dependencies:** [List item IDs this depends on]
- **Vertex AI Note:** How this helps the search understand RIA data

## Session Handoff
- **Items Completed:** [1a, 1b, 1c, 2a, 2b, 3a, 3b, 4a, 5a, 5b, 6a, 6b, 7a, 8a, 9a, 9b, 10a, 10b, 11a, 12a, 13a, 14a, 15a, 20a, 20b, 20c, 20d]
- **Items In Progress:** [16a, 16b, 17a, 17b, 18a, 18b, 19a, 21a, 21b, 22a, 22b, 22c, 22d, 23a, 23b]
- **Blockers:** [None]
- **Next Priority:** [All analysis complete. Ready to provide final summary.]
- **Context Preserved:** [A complete inventory of high-value knowledge sources has been created, including database migrations, a modern DocAI pipeline, the core strategic documents, and final analytical summaries. All critical knowledge has been cataloged.]
