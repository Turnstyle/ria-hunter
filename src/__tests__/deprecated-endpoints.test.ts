import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET as queryGet, POST as queryPost } from '@/app/api/v1/ria/query/route';

// Create a mock for the NextRequest
const createMockRequest = (headers = {}) => {
  return {
    headers: {
      get: jest.fn((key) => headers[key] || null),
    }
  } as unknown as NextRequest;
};

describe('Deprecated endpoints', () => {
  describe('/api/v1/ria/query', () => {
    it('GET should return 410 Gone status', async () => {
      const mockReq = createMockRequest();
      const response = await queryGet(mockReq);
      
      expect(response.status).toBe(410);
      
      const body = await response.json();
      expect(body.error).toContain('deprecated');
      expect(body.code).toBe('ENDPOINT_DEPRECATED');
      expect(body.alternatives).toHaveLength(2);
      
      // Should suggest alternatives
      const alternativeEndpoints = body.alternatives.map((alt: any) => alt.endpoint);
      expect(alternativeEndpoints).toContain('/api/ask');
      expect(alternativeEndpoints).toContain('/api/v1/ria/search');
    });
    
    it('POST should return 410 Gone status', async () => {
      const mockReq = createMockRequest();
      const response = await queryPost(mockReq);
      
      expect(response.status).toBe(410);
      
      const body = await response.json();
      expect(body.error).toContain('deprecated');
      expect(body.code).toBe('ENDPOINT_DEPRECATED');
      expect(body.alternatives).toHaveLength(2);
      
      // Should suggest alternatives
      const alternativeEndpoints = body.alternatives.map((alt: any) => alt.endpoint);
      expect(alternativeEndpoints).toContain('/api/ask');
      expect(alternativeEndpoints).toContain('/api/v1/ria/search');
    });
  });
});
