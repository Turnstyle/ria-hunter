/**
 * RIA Hunter Field Mapping and Validation Utilities
 * 
 * This module provides field mapping and validation utilities for processing
 * SEC Form ADV data and other RIA-related information.
 */

// Export field mapping utilities
export {
  canonical,
  getAllMappings,
  hasMapping,
  getReverseMappings
} from './fieldMap';

// Export validation utilities
export {
  isValidCIK,
  isValidCRD,
  normalizePhone,
  isValidPhone,
  isValidEmail,
  normalizeEmail,
  isValidZipCode,
  isValidStateCode,
  normalizeStateCode,
  normalizeUrl,
  isValidUrl,
  parseAUM,
  normalizeDate,
  isNotEmpty,
  validateRequiredFields
} from './validators';

// Export types for the mappings
export type FieldMappings = Record<string, string>;
export type ValidationResult = Record<string, boolean>;
export type RIAProfileValidation = {
  firm_name: boolean;
  crd_number: boolean;
  address: boolean;
  city: boolean;
  state: boolean;
  zip_code: boolean;
}; 