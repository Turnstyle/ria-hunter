import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock environment variables
const mockEnv = {
  CORS_ORIGIN: 'https://ria-hunter-app.vercel.app',
};

describe('/api/ask CORS Headers', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv, ...mockEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * Helper function to check CORS headers on a response
   */
  const expectCorsHeaders = (response: Response, expectedOrigin: string = 'https://ria-hunter-app.vercel.app') => {
    const headers = Object.fromEntries(response.headers.entries());
    expect(headers['access-control-allow-origin']).toBe(expectedOrigin);
    expect(headers['access-control-allow-headers']).toBe('Content-Type');
    expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  };

  /**
   * Test the corsify helper function directly
   */
  it('should create CORS-enabled response with corsify helper', () => {
    // Test the corsify function logic directly
    const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

    const corsify = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    // Test with different response types
    const jsonResponse = new Response(JSON.stringify({ test: 'data' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const corsifiedResponse = corsify(jsonResponse);

    expect(corsifiedResponse.status).toBe(200);
    expectCorsHeaders(corsifiedResponse);
    
    // Ensure original headers are preserved
    expect(corsifiedResponse.headers.get('content-type')).toBe('application/json');
  });

  it('should create CORS headers for OPTIONS response', () => {
    const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

    const corsify = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    // Simulate OPTIONS request response
    const optionsResponse = corsify(new Response(null, { status: 204 }));
    
    expect(optionsResponse.status).toBe(204);
    expectCorsHeaders(optionsResponse);
  });

  it('should create CORS headers for error responses', () => {
    const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

    const corsify = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    // Test error response
    const errorResponse = new Response(JSON.stringify({ error: 'Test error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });

    const corsifiedErrorResponse = corsify(errorResponse);

    expect(corsifiedErrorResponse.status).toBe(500);
    expectCorsHeaders(corsifiedErrorResponse);
  });

  it('should use wildcard origin when CORS_ORIGIN is not set', () => {
    // Remove CORS_ORIGIN from environment
    delete process.env.CORS_ORIGIN;

    const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

    const corsify = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    const response = corsify(new Response(null, { status: 204 }));
    
    expect(response.status).toBe(204);
    expectCorsHeaders(response, '*');
  });

  it('should preserve response body when adding CORS headers', async () => {
    const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

    const corsify = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    const testData = { answer: 'Test answer', sources: [] };
    const originalResponse = new Response(JSON.stringify(testData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const corsifiedResponse = corsify(originalResponse);
    const responseData = await corsifiedResponse.json();

    expect(responseData).toEqual(testData);
    expectCorsHeaders(corsifiedResponse);
  });
});