/**
 * Tests for RIA Hunter field mapping and validation utilities
 */

import {
  canonical,
  getAllMappings,
  hasMapping,
  getReverseMappings,
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
} from '../lib/mapping';

describe('Field Mapping Utilities', () => {
  describe('canonical', () => {
    test('should return mapped canonical name for known fields', () => {
      expect(canonical('Firm Name')).toBe('firm_name');
      expect(canonical('Legal Name')).toBe('firm_name');
      expect(canonical('CRD Number')).toBe('crd_number');
      expect(canonical('Assets Under Management')).toBe('aum');
    });

    test('should convert unknown fields to lowercase with underscores', () => {
      expect(canonical('Some Unknown Field')).toBe('some_unknown_field');
      expect(canonical('Another Test Field')).toBe('another_test_field');
      expect(canonical('UPPERCASE FIELD')).toBe('uppercase_field');
    });

    test('should handle fields with multiple spaces', () => {
      expect(canonical('Field  With   Multiple    Spaces')).toBe('field_with_multiple_spaces');
    });

    test('should handle empty strings', () => {
      expect(canonical('')).toBe('');
    });
  });

  describe('getAllMappings', () => {
    test('should return all field mappings', () => {
      const mappings = getAllMappings();
      expect(typeof mappings).toBe('object');
      expect(mappings['Firm Name']).toBe('firm_name');
      expect(mappings['CRD Number']).toBe('crd_number');
    });
  });

  describe('hasMapping', () => {
    test('should return true for fields with mappings', () => {
      expect(hasMapping('Firm Name')).toBe(true);
      expect(hasMapping('CRD Number')).toBe(true);
    });

    test('should return false for fields without mappings', () => {
      expect(hasMapping('Unknown Field')).toBe(false);
      expect(hasMapping('Random Text')).toBe(false);
    });
  });

  describe('getReverseMappings', () => {
    test('should return canonical names mapped to original labels', () => {
      const reverseMappings = getReverseMappings();
      expect(Array.isArray(reverseMappings['firm_name'])).toBe(true);
      expect(reverseMappings['firm_name']).toContain('Firm Name');
      expect(reverseMappings['firm_name']).toContain('Legal Name');
    });
  });
});

describe('Validation Utilities', () => {
  describe('isValidCIK', () => {
    test('should validate 10-digit CIK numbers', () => {
      expect(isValidCIK('0001234567')).toBe(true);
      expect(isValidCIK('1234567890')).toBe(true);
    });

    test('should reject invalid CIK numbers', () => {
      expect(isValidCIK('123456789')).toBe(false); // too short
      expect(isValidCIK('12345678901')).toBe(false); // too long
      expect(isValidCIK('123456789a')).toBe(false); // contains letter
      expect(isValidCIK('')).toBe(false); // empty
    });
  });

  describe('isValidCRD', () => {
    test('should validate CRD numbers with 1-8 digits', () => {
      expect(isValidCRD('1')).toBe(true);
      expect(isValidCRD('12345678')).toBe(true);
      expect(isValidCRD('123')).toBe(true);
    });

    test('should reject invalid CRD numbers', () => {
      expect(isValidCRD('123456789')).toBe(false); // too long
      expect(isValidCRD('abc123')).toBe(false); // contains letters
      expect(isValidCRD('')).toBe(false); // empty
      expect(isValidCRD('12.34')).toBe(false); // contains decimal
    });
  });

  describe('normalizePhone', () => {
    test('should normalize various phone formats to E.164', () => {
      expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhone('555-123-4567')).toBe('+15551234567');
      expect(normalizePhone('5551234567')).toBe('+15551234567');
      expect(normalizePhone('555.123.4567')).toBe('+15551234567');
    });

    test('should handle phone numbers with extra digits', () => {
      expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
      expect(normalizePhone('+1-555-123-4567')).toBe('+15551234567');
    });
  });

  describe('isValidPhone', () => {
    test('should validate phone numbers with exactly 10 digits', () => {
      expect(isValidPhone('(555) 123-4567')).toBe(true);
      expect(isValidPhone('5551234567')).toBe(true);
      expect(isValidPhone('555-123-4567')).toBe(true);
    });

    test('should reject invalid phone numbers', () => {
      expect(isValidPhone('555123456')).toBe(false); // too short
      expect(isValidPhone('55512345678')).toBe(false); // too long
      expect(isValidPhone('abc-def-ghij')).toBe(false); // no digits
    });
  });

  describe('isValidEmail', () => {
    test('should validate proper email formats', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    test('should reject invalid email formats', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
    });
  });

  describe('normalizeEmail', () => {
    test('should convert email to lowercase and trim', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(normalizeEmail('  user@domain.com  ')).toBe('user@domain.com');
    });
  });

  describe('isValidZipCode', () => {
    test('should validate 5-digit ZIP codes', () => {
      expect(isValidZipCode('12345')).toBe(true);
      expect(isValidZipCode('90210')).toBe(true);
    });

    test('should validate ZIP+4 format', () => {
      expect(isValidZipCode('12345-6789')).toBe(true);
      expect(isValidZipCode('90210-1234')).toBe(true);
    });

    test('should reject invalid ZIP codes', () => {
      expect(isValidZipCode('1234')).toBe(false); // too short
      expect(isValidZipCode('123456')).toBe(false); // too long
      expect(isValidZipCode('12345-67')).toBe(false); // invalid +4
      expect(isValidZipCode('abcde')).toBe(false); // letters
    });
  });

  describe('isValidStateCode', () => {
    test('should validate US state codes', () => {
      expect(isValidStateCode('CA')).toBe(true);
      expect(isValidStateCode('NY')).toBe(true);
      expect(isValidStateCode('TX')).toBe(true);
      expect(isValidStateCode('DC')).toBe(true);
    });

    test('should handle lowercase state codes', () => {
      expect(isValidStateCode('ca')).toBe(true);
      expect(isValidStateCode('ny')).toBe(true);
    });

    test('should reject invalid state codes', () => {
      expect(isValidStateCode('XX')).toBe(false);
      expect(isValidStateCode('ZZ')).toBe(false);
      expect(isValidStateCode('CAL')).toBe(false); // too long
      expect(isValidStateCode('C')).toBe(false); // too short
    });
  });

  describe('normalizeStateCode', () => {
    test('should convert to uppercase and trim', () => {
      expect(normalizeStateCode('ca')).toBe('CA');
      expect(normalizeStateCode('  ny  ')).toBe('NY');
    });
  });

  describe('normalizeUrl', () => {
    test('should add https protocol to URLs without protocol', () => {
      expect(normalizeUrl('example.com')).toBe('https://example.com');
      expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
    });

    test('should preserve existing protocols', () => {
      expect(normalizeUrl('http://example.com')).toBe('http://example.com');
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    });

    test('should return null for invalid URLs', () => {
      expect(normalizeUrl('not-a-url')).toBe(null);
      expect(normalizeUrl('')).toBe(null);
      expect(normalizeUrl('http://')).toBe(null);
    });
  });

  describe('isValidUrl', () => {
    test('should validate proper URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('example.com')).toBe(true);
      expect(isValidUrl('www.example.com')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('parseAUM', () => {
    test('should parse numeric AUM values', () => {
      expect(parseAUM('1234567')).toBe(1234567);
      expect(parseAUM('$1,234,567')).toBe(1234567);
      expect(parseAUM('1,234,567.89')).toBe(1234567.89);
    });

    test('should handle million and billion suffixes', () => {
      expect(parseAUM('1.5M')).toBe(1500000);
      expect(parseAUM('2.3B')).toBe(2300000000);
      expect(parseAUM('$100M')).toBe(100000000);
    });

    test('should return null for invalid AUM values', () => {
      expect(parseAUM('invalid')).toBe(null);
      expect(parseAUM('')).toBe(null);
      expect(parseAUM('abc')).toBe(null);
    });
  });

  describe('normalizeDate', () => {
    test('should normalize various date formats to ISO', () => {
      expect(normalizeDate('12/31/2023')).toBe('2023-12-31');
      expect(normalizeDate('2023-12-31')).toBe('2023-12-31');
      expect(normalizeDate('Dec 31, 2023')).toBe('2023-12-31');
    });

    test('should return null for invalid dates', () => {
      expect(normalizeDate('invalid-date')).toBe(null);
      expect(normalizeDate('')).toBe(null);
      expect(normalizeDate('13/32/2023')).toBe(null);
    });

    test('should reject dates outside reasonable range', () => {
      expect(normalizeDate('01/01/1800')).toBe(null);
      expect(normalizeDate('01/01/2200')).toBe(null);
    });
  });

  describe('isNotEmpty', () => {
    test('should validate non-empty strings', () => {
      expect(isNotEmpty('test')).toBe(true);
      expect(isNotEmpty('  test  ')).toBe(true);
    });

    test('should reject empty strings', () => {
      expect(isNotEmpty('')).toBe(false);
      expect(isNotEmpty('   ')).toBe(false);
    });
  });

  describe('validateRequiredFields', () => {
    test('should validate complete RIA profile', () => {
      const validProfile = {
        firm_name: 'Test Advisory LLC',
        crd_number: '123456',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip_code: '10001'
      };

      const result = validateRequiredFields(validProfile);
      expect(result.firm_name).toBe(true);
      expect(result.crd_number).toBe(true);
      expect(result.address).toBe(true);
      expect(result.city).toBe(true);
      expect(result.state).toBe(true);
      expect(result.zip_code).toBe(true);
    });

    test('should identify invalid required fields', () => {
      const invalidProfile = {
        firm_name: '',
        crd_number: '123456789', // too long
        address: 'Valid Address',
        city: '',
        state: 'XX', // invalid state
        zip_code: '1234' // too short
      };

      const result = validateRequiredFields(invalidProfile);
      expect(result.firm_name).toBe(false);
      expect(result.crd_number).toBe(false);
      expect(result.address).toBe(true);
      expect(result.city).toBe(false);
      expect(result.state).toBe(false);
      expect(result.zip_code).toBe(false);
    });

    test('should handle missing fields', () => {
      const incompleteProfile = {
        firm_name: 'Test Firm'
      };

      const result = validateRequiredFields(incompleteProfile);
      expect(result.firm_name).toBe(true);
      expect(result.crd_number).toBe(false);
      expect(result.address).toBe(false);
      expect(result.city).toBe(false);
      expect(result.state).toBe(false);
      expect(result.zip_code).toBe(false);
    });
  });
}); 