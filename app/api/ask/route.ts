import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callLLMToDecomposeQuery } from './planner'
import { unifiedSemanticSearch } from './unified-search'
import { buildAnswerContext } from './context-builder'
import { generateNaturalLanguageAnswer } from './generator'
import { checkDemoLimit, incrementDemoSession, getDemoSession } from '@/lib/demo-session'
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors'

// Keep OPTIONS handler as-is
export function OPTIONS(req: NextRequest) {
	return handleOptionsRequest(req)
}

// Simple JWT decoder (keep existing implementation)
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
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  
  console.log(`[${requestId}] === NEW SEARCH REQUEST ===`)
  console.log(`[${requestId}] URL: ${request.url}`)
  console.log(`[${requestId}] Method: ${request.method}`)
  console.log(`[${requestId}] Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth'}`)
  
  try {
    // Parse request
    const body = await request.json()
    const query = body.query?.trim()
    
    if (!query) {
      console.log(`[${requestId}] Error: Empty query`)
      return corsError(request, 'Query is required', 400)
    }
    
    console.log(`[${requestId}] Query: "${query}"`)
    
    // Check authentication
    const authHeader = request.headers.get('authorization')
    const userId = decodeJwtSub(authHeader)
    
    console.log(`[${requestId}] User ID: ${userId || 'anonymous'}`)
    
    // Check subscription status for authenticated users
    let isSubscriber = false
    if (userId) {
      const { data: sub, error: subError } = await supabaseAdmin
			.from('subscriptions')
			.select('status')
			.eq('user_id', userId)
			.single()
      
      if (subError) {
        console.log(`[${requestId}] Subscription check error:`, subError.message)
      } else {
        isSubscriber = sub?.status === 'active' || sub?.status === 'trialing'
        console.log(`[${requestId}] Subscription status: ${sub?.status}, isSubscriber: ${isSubscriber}`)
      }
    }
    
    // Check demo limits
    const demoCheck = checkDemoLimit(request, isSubscriber)
    console.log(`[${requestId}] Demo check:`, {
      allowed: demoCheck.allowed,
      searchesUsed: demoCheck.searchesUsed,
      searchesRemaining: demoCheck.searchesRemaining,
      isSubscriber
    })
    
    if (!demoCheck.allowed) {
      console.log(`[${requestId}] Demo limit reached, returning 402`)
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
    
    // Decompose query with AI
    console.log(`[${requestId}] Starting LLM decomposition...`)
    const decomposedPlan = await callLLMToDecomposeQuery(query)
    console.log(`[${requestId}] Decomposition complete:`, {
      semantic_query: decomposedPlan.semantic_query,
      structured_filters: decomposedPlan.structured_filters
    })
    
    // Execute unified semantic search
    console.log(`[${requestId}] Starting unified semantic search...`)
    const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
    console.log(`[${requestId}] Search complete:`, {
      resultCount: searchResult.results.length,
      searchStrategy: searchResult.metadata.searchStrategy,
      queryType: searchResult.metadata.queryType,
      confidence: searchResult.metadata.confidence
    })
    
    // Build context and generate answer
    const context = buildAnswerContext(searchResult.results, query)
    console.log(`[${requestId}] Context built, generating answer...`)
    
    const answer = await generateNaturalLanguageAnswer(query, context)
    console.log(`[${requestId}] Answer generated, length: ${answer.length}`)
    
    // Prepare response data
    const responseData = {
      answer,
      sources: searchResult.results,
      metadata: {
        searchStrategy: searchResult.metadata.searchStrategy,
        queryType: searchResult.metadata.queryType,
        confidence: searchResult.metadata.confidence,
        searchesRemaining: isSubscriber ? -1 : demoCheck.searchesRemaining - 1,
        searchesUsed: isSubscriber ? 0 : demoCheck.searchesUsed + 1,
        isAuthenticated: !!userId,
        isSubscriber,
        requestId
      }
    }
    
    // Create response
    let response = NextResponse.json(responseData, {
      headers: corsHeaders(request)
    })
    
    // Update demo counter for non-subscribers
    if (!isSubscriber) {
      console.log(`[${requestId}] Incrementing demo counter from ${demoCheck.searchesUsed} to ${demoCheck.searchesUsed + 1}`)
      response = incrementDemoSession(response, demoCheck.searchesUsed)
    }
    
    console.log(`[${requestId}] === REQUEST COMPLETE ===`)
    return response
    
  } catch (error) {
    console.error(`[${requestId}] Error in /api/ask:`, error)
    return corsError(request, 'Internal server error', 500)
  }
}