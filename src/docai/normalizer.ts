/**
 * Field Normalizer
 * 
 * This module transforms raw extracted data from Document AI
 * into a normalized format that matches our database schema.
 */

import { RIAProfile } from '../../lib/supabaseClient';

// Field mapping for standardization
const fieldMappings: Record<string, string> = {
  // Common Form ADV field mappings
  'Firm Name': 'firm_name',
  'Legal Name': 'firm_name',
  'Full Legal Name': 'firm_name',
  'CRD Number': 'crd_number',
  'Central Registration Depository (CRD) Number': 'crd_number',
  'SEC Number': 'sec_number',
  'SEC File Number': 'sec_number',
  'Address': 'address',
  'Street Address': 'address',
  'Principal Office Address': 'address',
  'Business Address': 'address',
  'City': 'city',
  'Principal City': 'city',
  'Business City': 'city',
  'State': 'state',
  'Principal State': 'state',
  'Business State': 'state',
  'Zip Code': 'zip_code',
  'ZIP': 'zip_code',
  'Postal Code': 'zip_code',
  'Principal ZIP': 'zip_code',
  'Business ZIP': 'zip_code',
  'Phone': 'phone',
  'Telephone Number': 'phone',
  'Business Phone': 'phone',
  'Contact Phone': 'phone',
  'Fax': 'fax',
  'Facsimile': 'fax',
  'Business Fax': 'fax',
  'Website': 'website',
  'Web Address': 'website',
  'URL': 'website',
  'Internet Address': 'website',
  'Assets Under Management': 'aum',
  'AUM': 'aum',
  'Total AUM': 'aum',
  'Employee Count': 'employee_count',
  'Number of Employees': 'employee_count',
  'Total Employees': 'employee_count',
};

/**
 * Normalize extracted field names and values to match our database schema
 * 
 * @param extractedData - Raw data extracted from Document AI
 * @returns Normalized data conforming to our RIAProfile interface
 */
export function normalizeFields(extractedData: Record<string, any>): Partial<RIAProfile> {
  const normalizedData: Partial<RIAProfile> = {};
  
  // Process each extracted field
  for (const [rawFieldName, rawValue] of Object.entries(extractedData)) {
    // Skip empty values
    if (!rawValue || typeof rawValue !== 'string' || rawValue.trim() === '') {
      continue;
    }
    
    // Convert field name to our standard format
    const normalizedFieldName = getNormalizedFieldName(rawFieldName);
    if (!normalizedFieldName) {
      continue; // Skip fields we don't recognize or care about
    }
    
    // Normalize the value based on field type
    const normalizedValue = normalizeFieldValue(normalizedFieldName, rawValue);
    
    // Add to our normalized data object
    if (normalizedValue !== null) {
      // Type-safe assignment using type assertion
      (normalizedData as any)[normalizedFieldName] = normalizedValue;
    }
  }
  
  console.log(`Normalized ${Object.keys(normalizedData).length} fields`);
  return normalizedData;
}

/**
 * Convert raw field name to standardized field name
 * 
 * @param rawFieldName - Original field name from extracted data
 * @returns Standardized field name or null if not recognized
 */
function getNormalizedFieldName(rawFieldName: string): string | null {
  // Try direct mapping first
  const normalizedName = fieldMappings[rawFieldName];
  if (normalizedName) {
    return normalizedName;
  }
  
  // Try case-insensitive matching
  const lowerRawName = rawFieldName.toLowerCase();
  for (const [mappingKey, mappingValue] of Object.entries(fieldMappings)) {
    if (lowerRawName.includes(mappingKey.toLowerCase())) {
      return mappingValue;
    }
  }
  
  // No matching field found
  return null;
}

/**
 * Normalize field value based on its expected type
 * 
 * @param fieldName - Normalized field name
 * @param rawValue - Raw value from extracted data
 * @returns Normalized value with appropriate type
 */
function normalizeFieldValue(fieldName: string, rawValue: string): any {
  // Clean up the raw value
  const cleanValue = rawValue.trim();
  
  switch (fieldName) {
    case 'crd_number':
      // Extract digits only from CRD
      return cleanValue.replace(/\D/g, '');
      
    case 'sec_number':
      // Ensure SEC number format (e.g., 801-12345)
      if (cleanValue.includes('-')) {
        return cleanValue;
      }
      // Try to format as 801-XXXXX if it's just digits
      const secDigits = cleanValue.replace(/\D/g, '');
      return secDigits ? `801-${secDigits}` : cleanValue;
      
    case 'phone':
      // Normalize phone to standard format
      const phoneDigits = cleanValue.replace(/\D/g, '');
      if (phoneDigits.length === 10) {
        return `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
      }
      return cleanValue;
    
    case 'fax':
      // Normalize fax to standard format (same as phone)
      const faxDigits = cleanValue.replace(/\D/g, '');
      if (faxDigits.length === 10) {
        return `(${faxDigits.slice(0, 3)}) ${faxDigits.slice(3, 6)}-${faxDigits.slice(6)}`;
      }
      return cleanValue;
      
    case 'website':
      // Ensure website has proper URL format
      let website = cleanValue.toLowerCase();
      if (!website.startsWith('http://') && !website.startsWith('https://')) {
        website = `https://${website}`;
      }
      return website;
      
    case 'aum':
      // Extract numeric AUM value in millions or billions
      const aumText = cleanValue.toLowerCase();
      const aumMatch = aumText.match(/[\d.,]+/);
      if (aumMatch) {
        let aumValue = parseFloat(aumMatch[0].replace(/,/g, ''));
        if (aumText.includes('billion') || aumText.includes('b')) {
          aumValue *= 1000000000;
        } else if (aumText.includes('million') || aumText.includes('m')) {
          aumValue *= 1000000;
        }
        return aumValue;
      }
      return null;
      
    case 'employee_count':
      // Extract numeric employee count
      const employeeMatch = cleanValue.match(/\d+/);
      return employeeMatch ? parseInt(employeeMatch[0], 10) : null;
      
    default:
      // Return as is for other fields
      return cleanValue;
  }
} 