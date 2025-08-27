import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from '@/app/api/ask/planner'
import { unifiedSemanticSearch } from '@/app/api/ask/unified-search'
import { buildAnswerContext } from '@/app/api/ask/context-builder'
import { streamAnswerTokens } from '@/app/api/ask/generator'
import { checkDemoLimit, incrementDemoSession } from '@/lib/demo-session'
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors'

// Use the new central CORS implementation from lib/cors.ts
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Simple JWT decoder
function decodeJwtSub(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const parts = authorizationHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  const token = parts[1]
  const segments = token.split('.')
  if (segments.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return payload?.sub || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
	// Add request logging for debugging with unique ID
	const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	const method = request.method;
	const url = request.url;
	const headers = Object.fromEntries(request.headers.entries());
	  
	console.log(`[${requestId}] Incoming streaming request:`, {
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
		
		console.log(`[${requestId}] Query: "${query}"`)
		
		// Check authentication
		const authHeader = request.headers.get('authorization')
		const userId = decodeJwtSub(authHeader)
		
		console.log(`[${requestId}] User ID: ${userId || 'anonymous'}`)
		
		// Check subscription status for authenticated users
		let isSubscriber = false
		if (userId) {
			// Note: We would need to import supabaseAdmin if we want subscription checking
			// For now, treating authenticated users as subscribers for streaming
			isSubscriber = true
		}
		
		// Check demo limits for anonymous users
		if (!userId) {
			const demoCheck = checkDemoLimit(request, isSubscriber)
			console.log(`[${requestId}] Demo check:`, {
				allowed: demoCheck.allowed,
				searchesUsed: demoCheck.searchesUsed,
				searchesRemaining: demoCheck.searchesRemaining
			})
			
			if (!demoCheck.allowed) {
				console.log(`[${requestId}] Demo limit reached for streaming, returning 402`)
				return new Response(
					JSON.stringify({
						error: 'You\'ve used your 5 free demo searches. Sign up for unlimited access.',
						code: 'DEMO_LIMIT_REACHED',
						searchesUsed: demoCheck.searchesUsed,
						searchesRemaining: 0,
						upgradeRequired: true
					}),
					{ 
						status: 402,
						headers: {
							...corsHeaders(request),
							'Content-Type': 'application/json'
						}
					}
				)
			}
		}
		
		// Process the query
		const plan = await callLLMToDecomposeQuery(query)
		console.log(`[${requestId}] Query decomposed:`, {
			semantic_query: plan.semantic_query,
			structured_filters: plan.structured_filters
		})
		
		// Execute the query using unified semantic search
		console.log(`[${requestId}] Starting unified semantic search for streaming...`)
		const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
		const rows = searchResult.results
		console.log(`[${requestId}] Search complete, ${rows.length} results found`)
		
		const context = buildAnswerContext(rows as any, query)
		
		// Set up SSE stream with proper error handling and guaranteed completion
		const encoder = new TextEncoder()
		const sse = new ReadableStream<Uint8Array>({
			async start(controller) {
				let streamStarted = false;
				try {
					// Send initial connection confirmation
					controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
					streamStarted = true;
					
					console.log(`[${requestId}] Starting token stream...`)
					
					// Stream tokens with proper SSE format
					for await (const token of streamAnswerTokens(query, context)) {
						// Properly format each token for SSE (escape newlines if needed)
						const escapedToken = JSON.stringify(token);
						controller.enqueue(encoder.encode(`data: {"token":${escapedToken}}\n\n`));
					}
					
					console.log(`[${requestId}] Token streaming complete`)
				} catch (err) {
					console.error(`[${requestId}] Stream error:`, err);
					
					// If we haven't started streaming yet, send a fallback message
					if (!streamStarted) {
						controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));
					}
					
					// Send error as a proper message instead of error event
					const errorMessage = `I encountered an issue processing your request. Here's what I found: ${context ? context.substring(0, 500) + '...' : 'No context available'}`;
					controller.enqueue(encoder.encode(`data: {"token":${JSON.stringify(errorMessage)}}\n\n`));
				} finally {
					// ALWAYS send completion marker, no matter what happened
					try {
						controller.enqueue(encoder.encode('data: [DONE]\n\n'));
						controller.enqueue(encoder.encode('event: end\n\n'));
					} catch (closeErr) {
						console.error(`[${requestId}] Error sending completion marker:`, closeErr);
					}
					
					// Close the stream
					controller.close();
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
		
		let response = new Response(sse, { headers });
		
		// Update demo counter for anonymous users
		if (!userId) {
			const demoCheck = checkDemoLimit(request, isSubscriber)
			console.log(`[${requestId}] Updating demo session from ${demoCheck.searchesUsed} to ${demoCheck.searchesUsed + 1}`)
			response = incrementDemoSession(NextResponse.next(), demoCheck.searchesUsed)
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