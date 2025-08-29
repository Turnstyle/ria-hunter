// tests/credits/shape.test.ts
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/balance/route';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Mock the dependencies
jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

jest.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('Credits Balance API - Response Shape', () => {
  let mockSupabaseAuth: any;
  let mockRequest: NextRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSupabaseAuth = {
      auth: {
        getUser: jest.fn(),
      },
    };
    
    (createRouteHandlerClient as jest.Mock).mockReturnValue(mockSupabaseAuth);
    
    // Create a mock request
    mockRequest = new NextRequest('https://ria-hunter.app/api/credits/balance');
  });

  it('should return status 200 and correct JSON shape for anonymous users', async () => {
    // Mock no authenticated user (anonymous)
    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(mockRequest);
    
    // Check status
    expect(response.status).toBe(200);
    
    // Check response body shape
    const body = await response.json();
    expect(body).toHaveProperty('credits');
    expect(body).toHaveProperty('isSubscriber');
    expect(typeof body.credits).toBe('number');
    expect(typeof body.isSubscriber).toBe('boolean');
    
    // Verify anonymous user gets 15 credits and is not a subscriber
    expect(body.credits).toBe(15);
    expect(body.isSubscriber).toBe(false);
  });

  it('should include both credits and balance fields for legacy compatibility', async () => {
    // Mock no authenticated user
    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(mockRequest);
    const body = await response.json();
    
    // Both fields should be present and equal
    expect(body).toHaveProperty('credits');
    expect(body).toHaveProperty('balance');
    expect(body.credits).toBe(body.balance);
  });

  it('should include proper cache control headers', async () => {
    // Mock no authenticated user
    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(mockRequest);
    
    // Check headers
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should set guest_id cookie for new anonymous users', async () => {
    // Mock no authenticated user and no existing guest_id
    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(mockRequest);
    
    // Check that a Set-Cookie header exists for guest_id
    const setCookieHeader = response.headers.get('Set-Cookie');
    expect(setCookieHeader).toBeTruthy();
    
    // Verify the response still has correct shape
    const body = await response.json();
    expect(body.credits).toBe(15);
    expect(body.isSubscriber).toBe(false);
  });
});
