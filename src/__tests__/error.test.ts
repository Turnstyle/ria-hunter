import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  apiError, 
  badRequest, 
  unauthorized, 
  forbidden, 
  notFound, 
  internalError, 
  paymentRequired,
  deprecated
} from '@/lib/error';

describe('Error handling', () => {
  // Save and restore process.env
  const originalEnv = process.env;
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Silence console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });
  
  describe('apiError', () => {
    it('should create a response with the correct status code', async () => {
      const response = apiError(400, 'Bad request', 'BAD_REQUEST');
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Bad request');
      expect(body.code).toBe('BAD_REQUEST');
    });
    
    it('should include details in development mode', async () => {
      process.env.NODE_ENV = 'development';
      
      const response = apiError(500, 'Server error', 'INTERNAL_ERROR', { cause: 'Database connection failed' });
      const body = await response.json();
      
      expect(body.detail).toBeDefined();
      expect(body.detail).toEqual({ cause: 'Database connection failed' });
    });
    
    it('should omit details in production mode', async () => {
      process.env.NODE_ENV = 'production';
      
      const response = apiError(500, 'Server error', 'INTERNAL_ERROR', { cause: 'Database connection failed' });
      const body = await response.json();
      
      expect(body.detail).toBeUndefined();
    });
  });
  
  describe('Error helper functions', () => {
    it('badRequest should return 400 status', async () => {
      const response = badRequest('Invalid input');
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.code).toBe('BAD_REQUEST');
    });
    
    it('unauthorized should return 401 status', async () => {
      const response = unauthorized();
      expect(response.status).toBe(401);
      
      const body = await response.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });
    
    it('paymentRequired should return 402 with payment details', async () => {
      const response = paymentRequired('Subscription required', 0, false);
      expect(response.status).toBe(402);
      
      const body = await response.json();
      expect(body.code).toBe('PAYMENT_REQUIRED');
      expect(body.detail.upgradeRequired).toBe(true);
      expect(body.detail.isSubscriber).toBe(false);
    });
    
    it('forbidden should return 403 status', async () => {
      const response = forbidden();
      expect(response.status).toBe(403);
      
      const body = await response.json();
      expect(body.code).toBe('FORBIDDEN');
    });
    
    it('notFound should return 404 status', async () => {
      const response = notFound('Resource not available');
      expect(response.status).toBe(404);
      
      const body = await response.json();
      expect(body.code).toBe('NOT_FOUND');
    });
    
    it('deprecated should return 410 with alternatives', async () => {
      const alternatives = [
        { endpoint: '/api/v2/resource', description: 'New version' }
      ];
      
      const response = deprecated('This endpoint is deprecated', alternatives);
      expect(response.status).toBe(410);
      
      const body = await response.json();
      expect(body.code).toBe('ENDPOINT_DEPRECATED');
      expect(body.detail.alternatives).toEqual(alternatives);
    });
    
    it('internalError should return 500 status', async () => {
      const response = internalError();
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.code).toBe('INTERNAL_ERROR');
    });
    
    it('internalError should handle error objects', async () => {
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at function1\n    at function2';
      
      const response = internalError('Server error occurred', error);
      const body = await response.json();
      
      expect(body.detail).toBeDefined();
      expect(body.detail.message).toBe('Something went wrong');
      expect(body.detail.name).toBe('Error');
      expect(body.detail.stack).toBeDefined();
    });
  });
});
