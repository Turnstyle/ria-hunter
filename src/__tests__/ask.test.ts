import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { buildAnswerContext } from '@/app/api/ask/context-builder';

// Mock ActivityRow data
const mockRiaData = [
  {
    crd_number: 123456,
    legal_name: 'Example Advisors LLC',
    city: 'San Francisco',
    state: 'CA',
    vc_fund_count: 5,
    vc_total_aum: 1000000000,
    activity_score: 8.5,
    executives: [
      { name: 'Jane Smith', title: 'CEO' },
      { name: 'John Doe', title: 'CIO' }
    ]
  },
  {
    crd_number: 789012,
    legal_name: 'Test Wealth Management',
    city: 'New York',
    state: 'NY',
    vc_fund_count: 3,
    vc_total_aum: 750000000,
    activity_score: 6.2,
    executives: [
      { name: 'Alice Johnson', title: 'President' }
    ]
  }
];

describe('Ask API functionality', () => {
  describe('buildAnswerContext', () => {
    it('should include full details when includeDetails is true', () => {
      const result = buildAnswerContext(mockRiaData, 'test query', true);
      
      // Check that executives are included
      expect(result).toContain('Jane Smith (CEO)');
      expect(result).toContain('Activity Score');
      expect(result).toContain('Executives:');
    });
    
    it('should omit executive details when includeDetails is false', () => {
      const result = buildAnswerContext(mockRiaData, 'test query', false);
      
      // Executives should not be included
      expect(result).not.toContain('Jane Smith (CEO)');
      expect(result).not.toContain('Executives:');
      
      // Basic info should still be present
      expect(result).toContain('Example Advisors LLC');
      expect(result).toContain('San Francisco, CA');
      expect(result).toContain('VC funds: 5');
    });
    
    it('should handle empty data gracefully', () => {
      const result = buildAnswerContext([], 'test query', true);
      expect(result).toContain('User query: test query');
      // No numbered items should be present
      expect(result).not.toMatch(/\d+\./);
    });
    
    it('should limit the number of results to 25 maximum', () => {
      // Create an array with 30 items
      const largeDataset = Array(30).fill(0).map((_, i) => ({
        crd_number: 100000 + i,
        legal_name: `Advisor ${i}`,
        city: 'City',
        state: 'ST',
        vc_fund_count: 1,
        vc_total_aum: 1000000,
        activity_score: 1.0,
        executives: []
      }));
      
      const result = buildAnswerContext(largeDataset, 'test query', true);
      
      // Count the number of lines with numbered items (1., 2., etc.)
      const numberedLines = result.split('\n').filter(line => /^\d+\./.test(line));
      expect(numberedLines.length).toBe(25);
    });
  });
});
