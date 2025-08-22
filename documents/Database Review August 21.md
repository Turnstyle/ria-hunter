# RIA Hunter Database Review - August 21, 2025

## Executive Summary

This report provides a comprehensive analysis of the RIA Hunter project's data infrastructure, focusing on the raw SEC ADV filing data and its representation in the Supabase database. The review aims to evaluate the completeness, accuracy, and accessibility of the data for the project's objectives.

Our analysis reveals that while the Supabase database contains significant amounts of processed SEC data (over 100,000 RIA profiles and 41,000 narratives), there are apparent discrepancies between the raw data files and what has been processed into the database. The database includes essential vector embeddings for semantic search functionality, but appears to be missing several tables mentioned in the schema migrations.

## 1. Raw Data Analysis

### 1.1 Data Structure and Content

The `/raw` directory contains a wealth of SEC ADV filing data organized by month (January 2025 through July 2025), with each month containing numerous CSV files detailing different aspects of RIA filings.

Key file types include:

- **ADV Base Files** (`IA_ADV_Base_A_*.csv` and `IA_ADV_Base_B_*.csv`): Contains primary RIA information including legal names, business names, contact information, AUM, client counts, and regulatory status.
- **Schedule A/B Files** (`IA_Schedule_A_B_*.csv`): Lists control persons, ownership structures, and entity relationships.
- **Schedule D Files**: Multiple files detailing specific information such as:
  - `IA_Schedule_D_7B1_*.csv`: Private fund information (fund names, types, AUM, minimum investments)
  - `IA_Schedule_D_7A_*.csv`: Related entities and advisory affiliates
  - Other Schedule D files covering regulatory actions, disciplinary history, and more.
- **FIRM CRS Files**: Monthly customer relationship summary documents.

### 1.2 Data Richness

The raw data contains extraordinarily detailed information about RIAs, including:

1. **Business Information**:
   - Legal and business names (often different)
   - Physical locations and contact information
   - Website URLs
   - Registration status and history

2. **Financial Data**:
   - Assets under management (AUM)
   - Client counts by category
   - Fee arrangements
   - Private fund details

3. **Personnel Information**:
   - Executive officers
   - Control persons
   - Ownership structure (including percentages)
   - Professional backgrounds

4. **Regulatory Information**:
   - SEC and state registration details
   - Disciplinary history
   - Legal actions
   - CRD and CIK identifiers

The raw data provides an extensive foundation for a comprehensive RIA database, with thousands of filings across multiple months.

## 2. Supabase Database Analysis

### 2.1 Database Structure

The Supabase database contains the following key tables:

1. **ria_profiles**: 103,620 rows
   - Contains basic RIA information: CRD number, legal name, city, state, AUM, etc.
   - Fields include: crd_number, legal_name, city, state, aum, form_adv_date, private_fund_count, private_fund_aum, last_private_fund_analysis, fax, phone, website, cik

2. **narratives**: 41,303 rows
   - Contains text descriptions of RIAs with vector embeddings for semantic search
   - Fields include: id, crd_number, narrative, embedding, created_at, updated_at

3. **control_persons**: 1,457 rows
   - Lists individuals with control over RIAs
   - Fields include: control_person_pk, filing_fk, person_name, control_type, created_at, updated_at, crd_number, title, adviser_id

4. **ria_private_funds**: 292 rows
   - Details private funds managed by RIAs
   - Fields include numerous fund details such as fund_name, fund_type, gross_asset_value, min_investment, etc.

5. **Other tables**:
   - subscriptions: 0 rows
   - user_queries: 0 rows
   - user_shares: 0 rows
   - contact_submissions: 0 rows

### 2.2 Vector Embeddings

The `narratives` table includes an `embedding` column that stores vector representations of the narrative text. These embeddings are critical for enabling semantic search functionality. Our analysis shows:

- The embedding column exists and contains data
- The embeddings appear to be stored as strings rather than native vector types
- The vector search function `match_documents` appears to be missing, which suggests that while embeddings exist, the vector search functionality may not be fully implemented

### 2.3 Data Coverage and Gaps

Based on the row counts and sample data examined:

1. **Coverage Strengths**:
   - Extensive RIA profile coverage (103,620 records)
   - Significant narrative content (41,303 records)
   - Private fund data is present but appears limited (292 records)

2. **Apparent Gaps**:
   - Control persons data appears sparse (1,457 records)
   - User-facing tables (subscriptions, user_queries, user_shares) are empty
   - The number of private funds (292) seems low compared to the expected number based on raw data

## 3. Discrepancies and Issues

### 3.1 Data Completeness Issues

1. **Private Funds Coverage**:
   - The raw data contains thousands of private funds across the ADV filings
   - The database only contains 292 private fund records
   - This suggests either incomplete data processing or selective import

2. **Control Persons**:
   - The raw data contains extensive information about control persons
   - The database only has 1,457 control person records
   - This indicates a significant gap in personnel data coverage

3. **Narratives vs. Profiles**:
   - While there are 103,620 RIA profiles, only 41,303 have narratives
   - This suggests that over 60% of RIAs lack semantic search capability

### 3.2 Vector Search Functionality

Our test of the vector search functionality indicates potential issues:

- The `match_documents` function could not be found
- This suggests that while embeddings exist, the vector search infrastructure may not be fully implemented
- Further investigation is needed to determine if there is an alternative search function or if this is a missing component

### 3.3 Schema vs. Data

- The migration files in the codebase suggest a more complex schema than what appears to be implemented
- Several tables mentioned in migrations either don't exist or couldn't be accessed with the current permissions

## 4. Recommendations

Based on our analysis, we recommend the following actions:

1. **Data Processing Audit**:
   - Review ETL processes to understand why only a subset of private funds and control persons were imported
   - Verify that the current database reflects the intended data model

2. **Vector Search Implementation**:
   - Verify the correct implementation of pgvector and associated search functions
   - Test and fix the vector search capabilities

3. **Data Completeness**:
   - Prioritize importing additional private fund data
   - Complete narrative generation for all RIA profiles
   - Ensure control persons data is comprehensive

4. **Schema Review**:
   - Reconcile the actual database schema with the intended schema from migrations
   - Document any intentional deviations

5. **User-Facing Features**:
   - Implement and test the subscription, query, and sharing features
   - Ensure these tables are properly integrated with the main data tables

## 5. Conclusion

The RIA Hunter project has a strong foundation with extensive raw data and a partially populated database. However, significant gaps exist between the raw data's richness and what has been processed into the database. The vector embedding infrastructure exists but may not be fully functional.

Addressing the identified issues would substantially improve the project's data coverage and functionality, particularly for semantic search capabilities which appear to be a core feature of the platform.
