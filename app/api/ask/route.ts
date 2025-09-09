import { NextResponse, type NextRequest } from 'next/server';
import { callLLMToDecomposeQuery } from './planner';
import { unifiedSemanticSearch } from './unified-search';
import { buildAnswerContext } from './context-builder';
import { generateNaturalLanguageAnswer } from './generator';
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

// Main /api/ask endpoint - using unified semantic search
export async function POST(req: NextRequest) {
  const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === MAIN ASK ENDPOINT ===`);
  console.log(`[${requestId}] Using unified semantic search`);
  
  try {
    // Parse request body
    const body = await req.json().catch(() => ({} as any));
    const query = typeof body?.query === 'string' ? body.query : '';
    
    if (!query) {
      return corsError(req, 'Query is required', 400);
    }
    
    console.log(`[${requestId}] Query: "${query}"`);
    
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
      console.log(`[${requestId}] Query decomposed:`, {
        semantic_query: decomposition.semantic_query,
        structured_filters: decomposition.structured_filters
      });
    } catch (decompositionError) {
      console.error(`[${requestId}] ❌ Query decomposition failed:`, decompositionError);
      // Use fallback decomposition if LLM fails
      decomposition = {
        semantic_query: query,
        structured_filters: {
          location: null,
          min_aum: null,
          max_aum: null,
          services: null
        }
      };
    }
    
    // Execute unified semantic search
    console.log(`[${requestId}] Starting unified semantic search...`);
    const searchOptions = { 
      limit: body?.limit || 10,
      structuredFilters: {
        state: filters.state,
        city: filters.city,
        fundType: filters.fundType
      },
      forceStructured: !!filters.hasVcActivity // Force structured search if VC activity filtering needed
    };
    console.log(`[${requestId}] Search options:`, searchOptions);
    
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
    
    // Build context and generate answer
    const context = buildAnswerContext(filteredRows as any, query);
    const answer = await generateNaturalLanguageAnswer(query, context);
    
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
    
    // Return the response
    const response = {
      answer: answer,
      sources: filteredRows,
      metadata: metadata
    };
    
    console.log(`[${requestId}] Returning ${filteredRows.length} results with answer`);
    
    return NextResponse.json(response, { headers });
    
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
    limit: parseInt(searchParams.get('limit') || '10')
  };

  // Create a mock POST request with the body
  const mockRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body)
  });

  return POST(mockRequest);
}
