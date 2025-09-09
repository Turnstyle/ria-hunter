import { NextResponse, type NextRequest } from 'next/server';
import { callLLMToDecomposeQuery, fallbackDecompose } from './planner';
import { unifiedSemanticSearch } from './unified-search';
import { buildAnswerContext } from './context-builder';
import { generateNaturalLanguageAnswer, streamAnswerTokens } from './generator';
import { checkDemoLimit } from '@/lib/demo-session';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Simple JWT decoder
function decodeJwtSub(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  const token = parts[1];
  const segments = token.split('.');
  if (segments.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload?.sub || null;
  } catch {
    return null;
  }
}

// Main /api/ask endpoint - unified for both streaming and non-streaming
export async function POST(req: NextRequest) {
  const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === UNIFIED ASK ENDPOINT ===`);
  console.log(`[${requestId}] Using unified semantic search`);
  
  try {
    // Parse request body
    const body = await req.json().catch(() => ({} as any));
    const query = typeof body?.query === 'string' ? body.query : '';
    const isStreaming = body?.streaming === true;
    
    if (!query) {
      return corsError(req, 'Query is required', 400);
    }
    
    console.log(`[${requestId}] Query: "${query}"`);
    console.log(`[${requestId}] Streaming mode: ${isStreaming}`);
    
    // Check authentication
    const authHeader = req.headers.get('authorization');
    const userId = decodeJwtSub(authHeader);
    
    console.log(`[${requestId}] User ID: ${userId || 'anonymous'}`);
    
    // Check subscription status
    let isSubscriber = false;
    if (userId) {
      isSubscriber = true; // Treating authenticated users as subscribers for now
    }
    
    // Check demo limits for anonymous users
    if (!userId) {
      const demoCheck = checkDemoLimit(req, isSubscriber);
      console.log(`[${requestId}] Demo check:`, {
        allowed: demoCheck.allowed,
        searchesUsed: demoCheck.searchesUsed,
        searchesRemaining: demoCheck.searchesRemaining
      });
      
      if (!demoCheck.allowed) {
        console.log(`[${requestId}] Demo limit reached, returning 402`);
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
              ...corsHeaders(req),
              'Content-Type': 'application/json'
            }
          }
        );
      }
    }
    
    // Process the query with filters from body
    const filters = body?.filters || {};
    console.log(`[${requestId}] Filters from body:`, filters);
    
    // Decompose the query to extract intent and location
    let decomposition;
    try {
      decomposition = await callLLMToDecomposeQuery(query);
      console.log(`[${requestId}] LLM Query decomposed:`, JSON.stringify({
        query: query,
        semantic_query: decomposition.semantic_query,
        structured_filters: decomposition.structured_filters
      }));
    } catch (decompositionError) {
      console.error(`[${requestId}] ❌ Query decomposition failed:`, decompositionError);
      // Use proper fallback
      decomposition = fallbackDecompose(query);
      console.log(`[${requestId}] Fallback decomposition used:`, JSON.stringify({
        query: query,
        semantic_query: decomposition.semantic_query,
        structured_filters: decomposition.structured_filters
      }));
    }
    
    // Execute unified semantic search
    console.log(`[${requestId}] Starting unified semantic search...`);
    
    // Extract location - prioritize direct detection over decomposition
    let extractedCity = filters.city;
    let extractedState = filters.state;
    
    // First, check the query directly for known patterns
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('st. louis') || queryLower.includes('st louis') || queryLower.includes('saint louis')) {
      extractedCity = 'St. Louis'; // Use the format that matches DB
      extractedState = 'MO';
      console.log(`[${requestId}] ✅ Direct detection: St. Louis, MO`);
    } else if (queryLower.includes('missouri')) {
      extractedState = 'MO';
      console.log(`[${requestId}] ✅ Direct detection: Missouri`);
    } else if (decomposition.structured_filters?.location) {
      // Fall back to decomposition if no direct match
      const extractedLocation = decomposition.structured_filters.location;
      console.log(`[${requestId}] Using decomposed location: ${extractedLocation}`);
      
      const locationParts = extractedLocation.split(',').map(p => p.trim());
      if (locationParts.length === 2) {
        extractedCity = locationParts[0];
        extractedState = locationParts[1];
      } else if (locationParts.length === 1) {
        const loc = locationParts[0];
        if (loc.length === 2 && loc === loc.toUpperCase()) {
          extractedState = loc;
        } else {
          extractedCity = loc;
        }
      }
    }
    
    console.log(`[${requestId}] Location extraction details:`, JSON.stringify({
      query: query,
      decomposedFilters: decomposition.structured_filters,
      finalCity: extractedCity,
      finalState: extractedState,
      willApplyFilters: !!(extractedCity || extractedState)
    }));
    
    // Force structured search for location-based superlative queries
    const isSuperlativeQuery = /\b(largest|biggest|top\s+\d+)\b/i.test(query);
    const hasLocation = !!(extractedCity || extractedState);
    const shouldForceStructured = !!filters.hasVcActivity || (isSuperlativeQuery && hasLocation);
    
    const searchOptions = { 
      limit: body?.limit || 10,
      structuredFilters: {
        state: extractedState || undefined,
        city: extractedCity || undefined,
        fundType: filters.fundType || undefined
      },
      forceStructured: shouldForceStructured
    };
    console.log(`[${requestId}] 🚨 CRITICAL: Search options:`, JSON.stringify({
      ...searchOptions,
      detectedLocation: { city: extractedCity, state: extractedState },
      isSuperlative: isSuperlativeQuery,
      hasLocation: hasLocation,
      shouldForce: shouldForceStructured
    }, null, 2));
    
    let searchResult;
    try {
      searchResult = await unifiedSemanticSearch(query, searchOptions);
      console.log(`[${requestId}] Search result metadata:`, searchResult.metadata);
    } catch (searchError) {
      console.error(`[${requestId}] ❌ Unified search failed:`, searchError);
      return corsError(req, 'Search failed', 500);
    }
    
    const rows = searchResult.results;
    console.log(`[${requestId}] Search complete, ${rows.length} results found`);
    
    // Apply hasVcActivity filter if specified (post-search filtering)
    let filteredRows = rows;
    if (filters.hasVcActivity) {
      console.log(`[${requestId}] Applying hasVcActivity filter...`);
      filteredRows = rows.filter(ria => {
        const hasFunds = ria.private_funds && ria.private_funds.length > 0;
        if (!hasFunds) return false;
        
        return ria.private_funds.some((fund: any) => {
          const fundType = (fund.fund_type || '').toLowerCase();
          return fundType.includes('venture') || 
                 fundType.includes('vc') || 
                 fundType.includes('private equity') || 
                 fundType.includes('pe');
        });
      });
      console.log(`[${requestId}] After VC filtering: ${filteredRows.length} results`);
    }
    
    // Build context for AI generation
    const context = buildAnswerContext(filteredRows as any, query);
    
    // Calculate metadata for the response
    const demoCheck = checkDemoLimit(req, isSubscriber);
    const metadata = {
      remaining: isSubscriber ? -1 : demoCheck.searchesRemaining - 1,
      isSubscriber: isSubscriber
    };
    
    // Update demo counter for anonymous users
    const headers = corsHeaders(req);
    if (!userId) {
      const newCount = demoCheck.searchesUsed + 1;
      console.log(`[${requestId}] Updating demo session from ${demoCheck.searchesUsed} to ${newCount}`);
      headers.set('Set-Cookie', `rh_demo=${newCount}; HttpOnly; Secure; SameSite=Lax; Max-Age=${24 * 60 * 60}; Path=/`);
    }
    
    // Handle streaming vs non-streaming response
    if (isStreaming) {
      console.log(`[${requestId}] Returning streaming response`);
      return handleStreamingResponse(req, requestId, query, context, filteredRows, metadata, headers);
    } else {
      console.log(`[${requestId}] Returning non-streaming response`);
      const answer = await generateNaturalLanguageAnswer(query, context);
      
      const response = {
        answer: answer,
        sources: filteredRows,
        metadata: metadata
      };
      
      console.log(`[${requestId}] Returning ${filteredRows.length} results with answer`);
      return NextResponse.json(response, { headers });
    }
    
  } catch (error) {
    console.error(`[${requestId}] Error in /api/ask:`, error);
    return corsError(req, 'An internal error occurred', 500);
  }
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
    limit: parseInt(searchParams.get('limit') || '10'),
    streaming: searchParams.get('streaming') === 'true'
  };

  // Create a mock POST request with the body
  const mockRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body)
  });

  return POST(mockRequest);
}

// Handle streaming response (extracted from ask-stream endpoint)
async function handleStreamingResponse(
  req: NextRequest,
  requestId: string, 
  query: string,
  context: string,
  filteredRows: any[],
  metadata: any,
  headers: Headers
): Promise<Response> {
  // Set up SSE headers
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');
  
  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
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
        
        console.log(`[${requestId}] Starting token stream...`);
        
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
        
        console.log(`[${requestId}] Token streaming complete`);
        
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
  });
  
  return new Response(stream, { headers });
}
