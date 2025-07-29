/**
 * Document AI Ingestion Pipeline Tests
 * 
 * Basic tests for the Document AI ingestion pipeline components.
 * Note: These tests use mocks and don't require actual API access.
 */

import { normalizeFields } from '../normalizer';
import { RIAProfile } from '../../../lib/supabaseClient';

// Mock data for testing
const mockExtractedData = {
  'Firm Name': 'Acme Investment Advisors, LLC',
  'CRD Number': '123456',
  'SEC Number': '801-12345',
  'Address': '123 Wall Street',
  'City': 'New York',
  'State': 'NY',
  'ZIP': '10001',
  'Phone': '(212) 555-1234',
  'Website': 'www.acmeinvestments.com',
  'Assets Under Management': '$1.2 billion',
  'Employee Count': '25 employees',
  'Unrelated Field': 'This should be ignored'
};

describe('Document AI Pipeline', () => {
  // Test the normalizer component
  describe('normalizeFields', () => {
    it('should normalize field names according to our schema', () => {
      const normalized = normalizeFields(mockExtractedData);
      
      // Check that field names were properly mapped
      expect(normalized.firm_name).toBeDefined();
      expect(normalized.crd_number).toBeDefined();
      expect(normalized.sec_number).toBeDefined();
      expect(normalized.address).toBeDefined();
      expect(normalized.city).toBeDefined();
      expect(normalized.state).toBeDefined();
      expect(normalized.zip_code).toBeDefined();
      expect(normalized.phone).toBeDefined();
      expect(normalized.website).toBeDefined();
      expect(normalized.aum).toBeDefined();
      expect(normalized.employee_count).toBeDefined();
      
      // Check that unrelated fields were ignored
      expect((normalized as any).unrelated_field).toBeUndefined();
    });
    
    it('should normalize field values to appropriate types', () => {
      const normalized = normalizeFields(mockExtractedData);
      
      // CRD number should be digits only
      expect(normalized.crd_number).toBe('123456');
      
      // SEC number should be properly formatted
      expect(normalized.sec_number).toBe('801-12345');
      
      // Website should have proper URL format
      expect(normalized.website).toBe('https://www.acmeinvestments.com');
      
      // AUM should be a number
      expect(typeof normalized.aum).toBe('number');
      expect(normalized.aum).toBe(1200000000); // $1.2 billion
      
      // Employee count should be a number
      expect(typeof normalized.employee_count).toBe('number');
      expect(normalized.employee_count).toBe(25);
    });
    
    it('should handle empty or missing values', () => {
      const incompleteData = {
        'Firm Name': 'Incomplete Advisors',
        'CRD Number': '654321',
        // Missing most fields
      };
      
      const normalized = normalizeFields(incompleteData);
      
      // Required fields should be present
      expect(normalized.firm_name).toBe('Incomplete Advisors');
      expect(normalized.crd_number).toBe('654321');
      
      // Missing fields should be undefined
      expect(normalized.sec_number).toBeUndefined();
      expect(normalized.address).toBeUndefined();
      expect(normalized.aum).toBeUndefined();
    });
  });
  
  // Add more test suites for other components as needed
}); 