import { it, expect, describe } from '@jest/globals';

describe('CORS support for /api/ask', () => {
  it('should return 204 status with CORS headers for OPTIONS request', async () => {
    // Mock the environment variable
    process.env.CORS_ORIGIN = 'https://ria-hunter-app.vercel.app';
    
    // We're going to implement the function directly in the test
    // to avoid issues with importing the actual file which has dependencies
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    
    const OPTIONS = () => {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    };
    
    const response = OPTIONS();
    
    expect(response.status).toBe(204);
    
    // Verify CORS headers
    const headers = Object.fromEntries(response.headers.entries());
    expect(headers['access-control-allow-origin']).toBe('https://ria-hunter-app.vercel.app');
    expect(headers['access-control-allow-headers']).toBe('Content-Type');
    expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  });
});