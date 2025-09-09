import { type NextRequest } from 'next/server'
import { POST as unifiedAskHandler } from '@/app/api/ask/route'
import { handleOptionsRequest } from '@/lib/cors'

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

/**
 * DEPRECATED: /api/ask-stream endpoint
 * 
 * This endpoint is deprecated as of the backend consolidation update.
 * Please use /api/ask with { streaming: true } in the request body instead.
 * 
 * This wrapper maintains backward compatibility by:
 * 1. Adding streaming: true to the request body
 * 2. Forwarding the request to the unified /api/ask endpoint
 * 
 * @deprecated Use /api/ask with streaming: true instead
 */
export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] /api/ask-stream is deprecated. Use /api/ask with streaming: true instead.');
  
  try {
    // Parse the existing body
    const body = await request.json().catch(() => ({} as any));
    
    // Force streaming mode
    body.streaming = true;
    
    // Create a new request for the unified endpoint
    const modifiedRequest = new NextRequest(request.url.replace('/ask-stream', '/ask'), {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body)
    });
    
    // Forward to the unified handler
    return unifiedAskHandler(modifiedRequest);
  } catch (error) {
    console.error('[DEPRECATED] Error in ask-stream wrapper:', error);
    // If something goes wrong, just forward the original request
    return unifiedAskHandler(request);
  }
}