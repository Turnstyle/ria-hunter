# RIA Hunter Naming Implementation Plan

## Overview

This document outlines the plan to address the issue of undefined RIA names in the database and improve the narrative generation process to skip records with missing names while we fix the underlying data issue.

## Current Issues

1. **Undefined RIA Names**: Many RIA records in the database have null values for both `legal_name` and `firm_name` fields.
2. **Inefficient API Usage**: The narrative generator is processing records with undefined names, resulting in generic narratives and wasted API calls.
3. **Inconsistent Data Quality**: The ETL process isn't properly prioritizing alternative name fields from raw data.

## Implementation Plan

### Phase 1: Skip Undefined Names in Narrative Generation (Immediate)

1. **Modify Narrative Generator**:
   - Create a new improved version that skips records with undefined names
   - Maintain all optimizations for batch size and delay
   - Add tracking for skipped records
   - Implement file: `scripts/improved_narrative_generator.js`

2. **Run Modified Generator**:
   - Stop existing generator
   - Start improved generator
   - Monitor for performance and successful skipping

### Phase 2: Fix Existing Undefined Names (Short-term)

1. **Create RIA Name Fixing Script**:
   - Implement script to identify records with undefined names
   - Fetch raw data for each record
   - Apply name prioritization algorithm (DBA name → primary_business_name → business_name → etc.)
   - Update the database with the best available name
   - Implement file: `scripts/fix_ria_names.js`

2. **Execute Name Fixing Process**:
   - Run script against all records with undefined names
   - Monitor progress and handle any errors
   - Verify results with a sample of fixed records

### Phase 3: Improve ETL Process (Long-term)

1. **Enhance ETL Name Handling**:
   - Create a standardized name prioritization module for all ETL processes
   - Implement a consistent approach across all data ingestion pipelines
   - Implement file: `scripts/etl_name_prioritization.js`

2. **Integrate with Existing ETL**:
   - Update document_ai_profiles.js (or equivalent) to use the name prioritization module
   - Ensure all new data imports apply the same prioritization rules

3. **Data Quality Monitoring**:
   - Add reporting on name field quality
   - Regularly check for undefined name percentages
   - Create alerts if quality drops below thresholds

## Name Prioritization Algorithm

The following priority order will be used to determine the best name for each RIA:

1. `dba_name` (Doing Business As name - what clients would typically search for)
2. `primary_business_name`
3. `business_name`
4. `adviser_name`
5. `organization_name`
6. `firm_name`
7. `entity_name`
8. `sec_filing_name`
9. `registrant_name`
10. `company_name`
11. `legal_name` (original field)
12. Default: "Unknown Investment Adviser (CRD #XXXXX)"

## Implementation Details

### Improved Narrative Generator

The improved generator adds logic to skip RIAs with undefined names:

```javascript
// Skip RIAs with undefined names
if (!ria.legal_name && !ria.firm_name) {
  skippedRIAs.push(ria.crd_number);
  continue;
}
```

### RIA Name Fixing Script

This script will:
1. Query the database for RIAs with undefined names
2. Fetch the corresponding raw data 
3. Apply the name prioritization algorithm
4. Update the database with the best available name

### ETL Name Prioritization Module

This reusable module will standardize name handling across all ETL processes, ensuring consistent data quality going forward.

## Expected Outcomes

1. **Improved Efficiency**: API calls will only be made for records with defined names
2. **Better Data Quality**: RIA records will have meaningful names using the best available data
3. **Consistent Experience**: Users will be able to search for RIAs by familiar names (DBA names)
4. **Cost Savings**: Avoiding duplicate API calls for records that would need to be reprocessed

## Timeline

- **Phase 1** (Immediate): 1 day
- **Phase 2** (Short-term): 3-5 days
- **Phase 3** (Long-term): 1-2 weeks integration, ongoing monitoring

## Monitoring and Reporting

Progress will be tracked through detailed logs:
- `improved_narrative_generation.log`
- `fix_ria_names.log`

Regular status updates will be provided showing:
- Number of records processed
- Percentage of undefined names resolved
- API cost savings from skipped records
