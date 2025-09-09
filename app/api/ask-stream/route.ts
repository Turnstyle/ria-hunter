import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from '@/app/api/ask/planner'
import { unifiedSemanticSearch } from '@/app/api/ask/unified-search'
import { buildAnswerContext } from '@/app/api/ask/context-builder'
import { streamAnswerTokens } from '@/app/api/ask/generator'
import { checkDemoLimit } from '@/lib/demo-session'
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
		
		// Process the query with filters from body
		const filters = body?.filters || {}
		console.log(`[${requestId}] Filters from body:`, filters)
		
		let plan;
		try {
			plan = await callLLMToDecomposeQuery(query)
			console.log(`[${requestId}] Query decomposed:`, {
				semantic_query: plan.semantic_query,
				structured_filters: plan.structured_filters
			})
		} catch (decompositionError) {
			console.error(`[${requestId}] ❌ Query decomposition failed:`, decompositionError)
			// Return error to frontend
			return corsError(request, 'Failed to process query', 500);
		}
		
		// Execute the query using unified semantic search with structured filters
		console.log(`[${requestId}] Starting unified semantic search for streaming...`)
		const searchOptions = { 
			limit: 10,
			structuredFilters: {
				state: filters.state,
				city: filters.city,
				fundType: filters.fundType
			},
			forceStructured: !!filters.hasVcActivity // Force structured search if VC activity filtering needed
		}
		console.log(`[${requestId}] Search options:`, searchOptions)
		
		let searchResult;
		try {
			searchResult = await unifiedSemanticSearch(query, searchOptions)
			console.log(`[${requestId}] Search result metadata:`, searchResult.metadata)
		} catch (searchError) {
			console.error(`[${requestId}] ❌ Unified search failed:`, searchError)
			// Return error to frontend
			return corsError(request, 'Search failed', 500);
		}
		
		const rows = searchResult.results
		console.log(`[${requestId}] Search complete, ${rows.length} results found`)
		if (rows.length === 0) {
			console.warn(`[${requestId}] ⚠️ No results returned from unifiedSemanticSearch`)
		}
		
		// Apply hasVcActivity filter if specified (post-search filtering)
		let filteredRows = rows
		if (filters.hasVcActivity) {
			console.log(`[${requestId}] Applying hasVcActivity filter...`)
			filteredRows = rows.filter(ria => {
				const hasFunds = ria.private_funds && ria.private_funds.length > 0
				if (!hasFunds) return false
				
				return ria.private_funds.some((fund: any) => {
					const fundType = (fund.fund_type || '').toLowerCase()
					return fundType.includes('venture') || 
						   fundType.includes('vc') || 
						   fundType.includes('private equity') || 
						   fundType.includes('pe')
				})
			})
			console.log(`[${requestId}] After VC filtering: ${filteredRows.length} results`)
		}
		
		const context = buildAnswerContext(filteredRows as any, query)
		
		// Calculate metadata for the response
		const demoCheck = checkDemoLimit(request, isSubscriber)
		const metadata = {
			remaining: isSubscriber ? -1 : demoCheck.searchesRemaining - 1,
			isSubscriber: isSubscriber
		}
		
		// Set up SSE stream with heartbeat and inactivity timeout prevention
		const encoder = new TextEncoder()
		const sse = new ReadableStream<Uint8Array>({
			async start(controller) {
				let streamStarted = false;
				let lastTokenTime = Date.now();
				
				// Heartbeat function to prevent inactivity timeout
				const sendHeartbeat = () => {
					try {
						const heartbeat = JSON.stringify('.');
						controller.enqueue(encoder.encode(`data: {"token":${heartbeat}}\n\n`));
						lastTokenTime = Date.now();
					} catch (err) {
						console.error(`[${requestId}] Heartbeat error:`, err);
					}
				};
				
				// Set up heartbeat interval (every 2 seconds)
				const heartbeatInterval = setInterval(() => {
					const timeSinceLastToken = Date.now() - lastTokenTime;
					// Send heartbeat if more than 3 seconds since last token
					if (timeSinceLastToken > 3000) {
						sendHeartbeat();
					}
				}, 2000);
				
				try {
					// Send initial connection confirmation with metadata
					controller.enqueue(encoder.encode(`data: {"type":"connected","metadata":${JSON.stringify(metadata)}}\n\n`));
					streamStarted = true;
					
					// Send processing status update
					const statusToken = JSON.stringify('🔍 Searching database...');
					controller.enqueue(encoder.encode(`data: {"token":${statusToken}}\n\n`));
					lastTokenTime = Date.now();
					
					console.log(`[${requestId}] Starting token stream...`)
					
					// Send another status update before AI generation
					const aiStatusToken = JSON.stringify('\n\n✨ Generating response...\n\n');
					controller.enqueue(encoder.encode(`data: {"token":${aiStatusToken}}\n\n`));
					lastTokenTime = Date.now();
					
					// Collect all tokens to build final response
					let fullAnswer = '';
					
					// Stream tokens with proper SSE format and timeout protection
					for await (const token of streamAnswerTokens(query, context)) {
						// Clear heartbeat since we got a real token
						lastTokenTime = Date.now();
						
						// Collect token for final response
						fullAnswer += token;
						
						// Properly format each token for SSE (escape newlines if needed)
						const escapedToken = JSON.stringify(token);
						controller.enqueue(encoder.encode(`data: {"token":${escapedToken}}\n\n`));
					}
					
					console.log(`[${requestId}] Token streaming complete`)
					
					// Send metadata and sources at the end
					const sourcesToken = JSON.stringify(`\n\n📊 **Sources**: ${filteredRows.length} RIAs found`);
					controller.enqueue(encoder.encode(`data: {"token":${sourcesToken}}\n\n`));
					
					// Send final complete response object for frontend
					const completeResponse = {
						answer: fullAnswer.trim(),
						sources: filteredRows,
						metadata: metadata
					};
					controller.enqueue(encoder.encode(`data: {"type":"complete","response":${JSON.stringify(completeResponse)}}\n\n`));
					controller.enqueue(encoder.encode(`data: {"type":"metadata","metadata":${JSON.stringify(metadata)}}\n\n`));
					
				} catch (err) {
					console.error(`[${requestId}] Stream error:`, err);
					
					// If we haven't started streaming yet, send a fallback message
					if (!streamStarted) {
						controller.enqueue(encoder.encode(`data: {"type":"connected","metadata":${JSON.stringify(metadata)}}\n\n`));
					}
					
					// Send error as a proper message instead of error event
					const errorMessage = `I encountered an issue processing your request. Here's what I found: ${context ? context.substring(0, 500) + '...' : 'No context available'}`;
					controller.enqueue(encoder.encode(`data: {"token":${JSON.stringify(errorMessage)}}\n\n`));
					
					// Send error response object for frontend
					const errorResponse = {
						answer: errorMessage,
						sources: filteredRows || [],
						metadata: metadata
					};
					controller.enqueue(encoder.encode(`data: {"type":"complete","response":${JSON.stringify(errorResponse)}}\n\n`));
				} finally {
					// Clear heartbeat interval
					clearInterval(heartbeatInterval);
					
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
		
		// Update demo counter for anonymous users
		if (!userId) {
			const demoCheck = checkDemoLimit(request, isSubscriber)
			console.log(`[${requestId}] Updating demo session from ${demoCheck.searchesUsed} to ${demoCheck.searchesUsed + 1}`)
			const newCount = demoCheck.searchesUsed + 1
			
			// Set the session cookie for demo tracking
			headers.set('Set-Cookie', `rh_demo=${newCount}; HttpOnly; Secure; SameSite=Lax; Max-Age=${24 * 60 * 60}; Path=/`)
		}
		
		const response = new Response(sse, { headers });
		
		// Log successful response
		console.log(`[${requestId}] Streaming response started`);
		return response;
	} catch (error) {
		console.error(`[${requestId}] Error in /api/ask-stream:`, error);
		
		// Use consistent error format with CORS headers
		return corsError(request, 'An internal error occurred', 500);
	}
}