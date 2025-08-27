import { NextResponse, type NextRequest } from 'next/server'
import { unifiedSemanticSearch } from '@/app/api/ask/unified-search'
import { executeEnhancedQuery } from '@/app/api/ask/retriever'
import { corsHeaders, handleOptionsRequest } from '@/lib/cors'

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { query } = body
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { 
          status: 400,
          headers: {
            ...corsHeaders(req),
            'Content-Type': 'application/json'
          }
        }
      )
    }
    
    console.log(`🧪 Testing AI search for query: "${query}"`)
    
    // Test the new unified semantic search
    const startTime = Date.now()
    let newSearchResults
    let newSearchError = null
    
    try {
      const newResult = await unifiedSemanticSearch(query, { limit: 5 })
      newSearchResults = {
        results: newResult.results,
        count: newResult.results.length,
        searchStrategy: newResult.metadata.searchStrategy,
        queryType: newResult.metadata.queryType,
        confidence: newResult.metadata.confidence,
        processingTime: Date.now() - startTime
      }
    } catch (error) {
      newSearchError = error instanceof Error ? error.message : 'Unknown error'
      console.error('New search error:', error)
    }
    
    // Test the old broken method for comparison
    const oldStartTime = Date.now()
    let oldSearchResults
    let oldSearchError = null
    
    try {
      const oldResults = await executeEnhancedQuery({
        filters: {},
        limit: 5,
        semantic_query: query
      })
      oldSearchResults = {
        results: oldResults || [],
        count: (oldResults || []).length,
        searchStrategy: 'broken-legacy',
        processingTime: Date.now() - oldStartTime
      }
    } catch (error) {
      oldSearchError = error instanceof Error ? error.message : 'Unknown error'
      console.error('Old search error:', error)
    }
    
    const response = {
      query,
      timestamp: new Date().toISOString(),
      comparison: {
        new_method: {
          ...newSearchResults,
          error: newSearchError,
          working: !newSearchError && newSearchResults && newSearchResults.count > 0
        },
        old_method: {
          ...oldSearchResults,
          error: oldSearchError,
          working: !oldSearchError && oldSearchResults && oldSearchResults.count > 0
        }
      },
      analysis: {
        improvement: newSearchResults && oldSearchResults ? 
          newSearchResults.count > oldSearchResults.count : 
          !newSearchError && !!oldSearchError,
        aiUsed: newSearchResults?.searchStrategy === 'semantic-first',
        confidence: newSearchResults?.confidence || 0
      }
    }
    
    console.log(`✅ Test completed:`, {
      query,
      newCount: newSearchResults?.count || 0,
      oldCount: oldSearchResults?.count || 0,
      aiUsed: response.analysis.aiUsed,
      confidence: response.analysis.confidence
    })
    
    return new Response(
      JSON.stringify(response, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'application/json'
        }
      }
    )
    
  } catch (error) {
    console.error('Test endpoint error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Test failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'application/json'
        }
      }
    )
  }
}
