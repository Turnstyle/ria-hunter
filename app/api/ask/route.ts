import { NextResponse, type NextRequest } from 'next/server';
import { POST as searchPost } from './search/route';
import { corsHeaders, handleOptionsRequest } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Main /api/ask endpoint - simplified to just call the search endpoint
export async function POST(req: NextRequest) {
  const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === MAIN ASK ENDPOINT ===`);
  console.log(`[${requestId}] Routing to search endpoint`);
  
  // Just pass through to the search endpoint
  return searchPost(req);
}

// GET request also supported for simple queries
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  
  // Convert GET params to POST body format
  const body = {
    query: searchParams.get('q') || searchParams.get('query') || '',
    filters: {
      state: searchParams.get('state'),
      city: searchParams.get('city'),
      fundType: searchParams.get('fundType'),
      minAum: searchParams.get('minAum') ? parseInt(searchParams.get('minAum')!) : undefined,
      hasVcActivity: searchParams.get('hasVcActivity') === 'true' || searchParams.get('vc') === 'true'
    },
    limit: parseInt(searchParams.get('limit') || '20')
  };

  // Create a mock POST request with the body
  const mockRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body)
  });

  return POST(mockRequest);
}
