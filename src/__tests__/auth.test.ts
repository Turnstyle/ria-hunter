import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { decodeJwtSub, parseAnonCookie } from '@/lib/auth';

// Mock NextRequest
const createMockRequest = (headers = {}, cookies = {}) => {
  return {
    headers: {
      get: jest.fn((key) => headers[key] || null),
    },
    cookies: {
      get: jest.fn((key) => cookies[key] || null),
    },
  } as unknown as NextRequest;
};

describe('Auth utilities', () => {
  describe('decodeJwtSub', () => {
    it('should return null for missing Authorization header', () => {
      expect(decodeJwtSub(null)).toBeNull();
      expect(decodeJwtSub(undefined)).toBeNull();
      expect(decodeJwtSub('')).toBeNull();
    });

    it('should return null for malformed Authorization header', () => {
      expect(decodeJwtSub('not-a-bearer-token')).toBeNull();
      expect(decodeJwtSub('Bearer ')).toBeNull();
      expect(decodeJwtSub('Bearer invalid')).toBeNull();
    });

    it('should extract sub from valid JWT', () => {
      // This is a valid structure JWT (payload is meaningless)
      const validToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.XNS_3soLIJbYjU-tMMx0PpnYdWQFX5bjKL-tGYV9mos';
      expect(decodeJwtSub(validToken)).toBe('user-123');
    });
  });

  describe('parseAnonCookie', () => {
    it('should return count 0 for missing cookie', () => {
      const req = createMockRequest();
      expect(parseAnonCookie(req)).toEqual({ count: 0 });
    });

    it('should parse count from valid cookie', () => {
      const req = createMockRequest({}, {
        'rh_qc': { value: '2' }
      });
      expect(parseAnonCookie(req)).toEqual({ count: 2 });
    });

    it('should handle invalid cookie values', () => {
      const req = createMockRequest({}, {
        'rh_qc': { value: 'not-a-number' }
      });
      expect(parseAnonCookie(req)).toEqual({ count: 0 });
    });
  });
});
