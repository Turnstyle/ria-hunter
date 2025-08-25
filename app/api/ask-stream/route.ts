import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from '@/app/api/ask/planner'
import { executeEnhancedQuery } from '@/app/api/ask/retriever'
import { buildAnswerContext } from '@/app/api/ask/context-builder'
import { streamAnswerTokens } from '@/app/api/ask/generator'
import { CREDITS_CONFIG } from '@/app/config/credits'
import { corsHeaders, handleOptionsRequest, addCorsHeaders, corsError } from '@/lib/cors'

// Use the new central CORS implementation from lib/cors.ts
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Helper function to parse anonymous cookie
function parseAnonCookie(req: NextRequest): { count: number } {
  try {
    const cookie = req.cookies.get(CREDITS_CONFIG.ANONYMOUS_COOKIE_NAME);
    if (cookie?.value) {
      const parsed = JSON.parse(cookie.value);
      return { count: Number(parsed.count) || 0 };
    }
  } catch {}
  return { count: 0 };
}

// Function to add anon cookie to response
function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.set(
    'Set-Cookie', 
    `${CREDITS_CONFIG.ANONYMOUS_COOKIE_NAME}=${JSON.stringify({ count: newCount })};path=/;max-age=${CREDITS_CONFIG.ANONYMOUS_COOKIE_MAX_AGE}`
  );
  return new Response(res.body, { 
    status: res.status, 
    statusText: res.statusText, 
    headers 
  });
}

export async function POST(request: NextRequest) {
	// Add request logging for debugging with unique ID
	const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	const method = request.method;
	const url = request.url;
	const headers = Object.fromEntries(request.headers.entries());
	  
	console.log(`[${requestId}] Incoming request:`, {
		method,
		url,
		origin: headers['origin'],
		headers: {
			'content-type': headers['content-type'],
			'accept': headers['accept'],
			'authorization': headers['authorization'] ? 'Bearer ***' : 'none'
		}
	});

	try {
		// Parse JSON body with error handling
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		
		if (!query) {
			return corsError(request, 'Query is required', 400);
		}
		
		// Get user authentication if available
		const userId = request.headers.get('x-user-id');
		const isAuthenticated = !!userId;
		
		// Check credits for anonymous users
		if (!isAuthenticated) {
			const anonCookie = parseAnonCookie(request);
			if (anonCookie.count >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {
				// Use standard format for CORS error with proper headers
				return new Response(
					JSON.stringify({
						error: CREDITS_CONFIG.MESSAGES.CREDITS_EXHAUSTED_ANONYMOUS,
						code: 'PAYMENT_REQUIRED',
						remaining: 0,
						isSubscriber: false,
						upgradeRequired: true
					}),
					{ 
						status: 402, 
						headers: {
							...corsHeaders(request),
							'Content-Type': 'application/json'
						} 
					}
				);
			}
		}
		
		// Process the query
		const plan = await callLLMToDecomposeQuery(query)
		let city: string | undefined
		let state: string | undefined
		const loc = plan.structured_filters?.location || ''
		if (typeof loc === 'string' && loc.length > 0) {
			const parts = loc.split(',').map((p) => p.trim())
			if (parts.length === 2) {
				city = parts[0]
				state = parts[1].toUpperCase()
			} else if (parts.length === 1 && parts[0].length === 2) {
				state = parts[0].toUpperCase()
			} else {
				city = parts[0]
			}
		}
		
		// Execute the query and build context
		const rows = await executeEnhancedQuery({ filters: { state, city }, limit: 10 })
		const context = buildAnswerContext(rows as any, query)
		
		// Set up SSE stream
		const encoder = new TextEncoder()
		const sse = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					// Send initial connection confirmation
          controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
          
					// Stream tokens
					for await (const token of streamAnswerTokens(query, context)) {
						controller.enqueue(encoder.encode(`data: ${token}\n\n`))
					}
					
					// Send completion marker
					controller.enqueue(encoder.encode('data: [DONE]\n\n'))
					controller.enqueue(encoder.encode('event: end\n\n'))
					controller.close()
				} catch (err) {
					console.error(`[${requestId}] Stream error:`, err);
					controller.enqueue(encoder.encode(`event: error\n` + `data: ${(err as any)?.message || String(err)}\n\n`))
					controller.close()
				}
			},
		})
		
		// Create the response with stream and proper headers
		const headers = corsHeaders(request);
		
		// Add SSE-specific headers
		headers.set('Content-Type', 'text/event-stream; charset=utf-8');
		headers.set('Cache-Control', 'no-cache, no-transform');
		headers.set('Connection', 'keep-alive');
		headers.set('X-Accel-Buffering', 'no');
		
		const response = new Response(sse, { headers });
		
		// If anonymous user, increment count and update cookie
		if (!isAuthenticated) {
			const anonCookie = parseAnonCookie(request);
			const newCount = anonCookie.count + 1;
			return withAnonCookie(response, newCount);
		}
		
		// Log successful response
		console.log(`[${requestId}] Streaming response started`);
		return response;
	} catch (error) {
		console.error(`[${requestId}] Error in /api/ask-stream:`, error);
		
		// Use consistent error format with CORS headers
		return corsError(request, 'An internal error occurred', 500);
	}
}


