// ETL Name Prioritization Script
// To be included in the ETL pipeline for future data imports
// Ensures RIA names are properly captured using a defined priority order

const namePrioritization = (rawData) => {
  // Priority order for RIA names
  const possibleNames = [
    rawData.dba_name,              // First priority: Doing Business As name
    rawData.primary_business_name, // Second priority
    rawData.business_name,         // Third priority
    rawData.adviser_name,          // Fourth priority
    rawData.organization_name,     // Fifth priority
    rawData.firm_name,             // Sixth priority
    rawData.entity_name,           // Seventh priority
    rawData.sec_filing_name,       // Eighth priority
    rawData.registrant_name,       // Ninth priority
    rawData.company_name,          // Tenth priority
    rawData.legal_name,            // Eleventh priority (original legal_name field)
    `Unknown Investment Adviser (CRD #${rawData.crd_number})` // Default fallback
  ];
  
  // Find the first non-null, non-empty name
  for (const name of possibleNames) {
    if (name && typeof name === 'string' && name.trim() !== '') {
      return name;
    }
  }
  
  // Fallback if all names are empty
  return `Unknown Investment Adviser (CRD #${rawData.crd_number})`;
};

// Export for use in ETL processes
module.exports = {
  namePrioritization
};

// Example usage in an ETL process:
/*
const { namePrioritization } = require('./etl_name_prioritization');

// During ETL processing:
const transformedData = rawData.map(item => {
  return {
    crd_number: item.crd_number,
    legal_name: namePrioritization(item),  // Apply name prioritization
    // ... other fields
  };
});

// Then insert into the database
*/
