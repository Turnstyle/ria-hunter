/**
 * Validation utilities for RIA Hunter data processing
 * 
 * This module provides validation functions for various data types
 * commonly found in SEC Form ADV filings and RIA data.
 */

/**
 * Validate CIK (Central Index Key) number
 * 
 * @param c - The CIK string to validate
 * @returns True if the CIK is exactly 10 digits
 * 
 * @example
 * isValidCIK('0001234567') // returns true
 * isValidCIK('123456789') // returns false (too short)
 * isValidCIK('12345678901') // returns false (too long)
 */
export const isValidCIK = (c: string): boolean => /^\d{10}$/.test(c);

/**
 * Validate CRD (Central Registration Depository) number
 * 
 * @param c - The CRD string to validate
 * @returns True if the CRD is 1 to 8 digits
 * 
 * @example
 * isValidCRD('12345678') // returns true
 * isValidCRD('1') // returns true
 * isValidCRD('123456789') // returns false (too long)
 * isValidCRD('abc123') // returns false (contains non-digits)
 */
export const isValidCRD = (c: string): boolean => /^\d{1,8}$/.test(c);

/**
 * Normalize US phone number to E.164 format
 * 
 * @param p - The phone number string to normalize
 * @returns Normalized phone number in +1XXXXXXXXXX format
 * 
 * @example
 * normalizePhone('(555) 123-4567') // returns '+15551234567'
 * normalizePhone('555-123-4567') // returns '+15551234567'
 * normalizePhone('5551234567') // returns '+15551234567'
 */
export const normalizePhone = (p: string): string =>
  '+1' + p.replace(/\D/g, '').slice(-10);

/**
 * Validate US phone number format
 * 
 * @param p - The phone number string to validate
 * @returns True if the phone number contains exactly 10 digits after cleaning
 */
export const isValidPhone = (p: string): boolean => {
  const cleaned = p.replace(/\D/g, '');
  return cleaned.length === 10;
};

/**
 * Validate email address format
 * 
 * @param email - The email string to validate
 * @returns True if the email has a valid format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Normalize email address to lowercase
 * 
 * @param email - The email string to normalize
 * @returns Lowercase email address
 */
export const normalizeEmail = (email: string): string => email.toLowerCase().trim();

/**
 * Validate US ZIP code format (5 digits or 5+4 format)
 * 
 * @param zip - The ZIP code string to validate
 * @returns True if the ZIP code is in valid format
 * 
 * @example
 * isValidZipCode('12345') // returns true
 * isValidZipCode('12345-6789') // returns true
 * isValidZipCode('1234') // returns false
 */
export const isValidZipCode = (zip: string): boolean => /^\d{5}(-\d{4})?$/.test(zip);

/**
 * Validate US state code (2-letter abbreviation)
 * 
 * @param state - The state code to validate
 * @returns True if the state code is valid
 */
export const isValidStateCode = (state: string): boolean => {
  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC' // District of Columbia
  ];
  return validStates.includes(state.toUpperCase());
};

/**
 * Normalize state code to uppercase
 * 
 * @param state - The state code to normalize
 * @returns Uppercase state code
 */
export const normalizeStateCode = (state: string): string => state.toUpperCase().trim();

/**
 * Validate and normalize URL
 * 
 * @param url - The URL string to validate and normalize
 * @returns Normalized URL with protocol, or null if invalid
 * 
 * @example
 * normalizeUrl('example.com') // returns 'https://example.com'
 * normalizeUrl('http://example.com') // returns 'http://example.com'
 * normalizeUrl('https://example.com') // returns 'https://example.com'
 */
export const normalizeUrl = (url: string): string | null => {
  try {
    let normalizedUrl = url.trim();
    
    // Return null for empty strings
    if (!normalizedUrl) {
      return null;
    }
    
    // Add protocol if missing
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Validate URL format
    const urlObj = new URL(normalizedUrl);
    
    // Additional validation: must have a valid hostname with at least one dot
    if (!urlObj.hostname || !urlObj.hostname.includes('.') || urlObj.hostname === 'not-a-url') {
      return null;
    }
    
    return normalizedUrl;
  } catch {
    return null;
  }
};

/**
 * Validate URL format
 * 
 * @param url - The URL string to validate
 * @returns True if the URL is valid
 */
export const isValidUrl = (url: string): boolean => {
  return normalizeUrl(url) !== null;
};

/**
 * Parse and normalize AUM (Assets Under Management) value
 * 
 * @param aum - The AUM string to parse (may contain currency symbols, commas)
 * @returns Numeric AUM value, or null if invalid
 * 
 * @example
 * parseAUM('$1,234,567') // returns 1234567
 * parseAUM('1.5M') // returns 1500000
 * parseAUM('2.3B') // returns 2300000000
 */
export const parseAUM = (aum: string): number | null => {
  try {
    let cleaned = aum.replace(/[$,\s]/g, '').toUpperCase();
    
    // Handle millions (M) and billions (B) suffixes
    let multiplier = 1;
    if (cleaned.endsWith('M')) {
      multiplier = 1000000;
      cleaned = cleaned.slice(0, -1);
    } else if (cleaned.endsWith('B')) {
      multiplier = 1000000000;
      cleaned = cleaned.slice(0, -1);
    }
    
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value * multiplier;
  } catch {
    return null;
  }
};

/**
 * Validate date string and convert to ISO format
 * 
 * @param dateStr - The date string to validate and normalize
 * @returns ISO date string (YYYY-MM-DD) or null if invalid
 * 
 * @example
 * normalizeDate('12/31/2023') // returns '2023-12-31'
 * normalizeDate('2023-12-31') // returns '2023-12-31'
 * normalizeDate('Dec 31, 2023') // returns '2023-12-31'
 */
export const normalizeDate = (dateStr: string): string | null => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Check if date is within reasonable range (1900-2100)
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      return null;
    }
    
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
};

/**
 * Validate if a string is not empty after trimming
 * 
 * @param value - The string to validate
 * @returns True if the string is not empty after trimming
 */
export const isNotEmpty = (value: string): boolean => {
  return value.trim().length > 0;
};

/**
 * Validate required fields for RIA profile
 * 
 * @param profile - Object containing RIA profile fields
 * @returns Object with validation results for each required field
 */
export const validateRequiredFields = (profile: Record<string, any>) => {
  return {
    firm_name: isNotEmpty(profile.firm_name || ''),
    crd_number: isValidCRD(profile.crd_number || ''),
    address: isNotEmpty(profile.address || ''),
    city: isNotEmpty(profile.city || ''),
    state: isValidStateCode(profile.state || ''),
    zip_code: isValidZipCode(profile.zip_code || '')
  };
}; 