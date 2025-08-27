import { NextRequest, NextResponse } from 'next/server'
import { unifiedSemanticSearch } from '../ask/unified-search'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { corsHeaders } from '@/lib/cors'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }
    
    console.log('🧪 TEST ENDPOINT: Starting test for query:', query)
    
    // Test semantic search
    const startTime = Date.now()
    const searchResult = await unifiedSemanticSearch(query, { limit: 10 })
    const searchDuration = Date.now() - startTime
    
    // Check embedding status
    const { count: totalNarratives } = await supabaseAdmin
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const { count: withEmbeddings } = await supabaseAdmin
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null)
    
    // Test result details
    const firstResult = searchResult.results[0]
    const hasExecutives = firstResult?.executives?.length > 0
    
    const testReport = {
      query,
      searchDuration: `${searchDuration}ms`,
      resultCount: searchResult.results.length,
      searchStrategy: searchResult.metadata.searchStrategy,
      queryType: searchResult.metadata.queryType,
      confidence: searchResult.metadata.confidence,
      firstResultSimilarity: firstResult?.similarity || 0,
      hasExecutives,
      databaseStatus: {
        totalNarratives,
        withEmbeddings,
        coverage: `${((withEmbeddings / totalNarratives) * 100).toFixed(1)}%`
      },
      topResults: searchResult.results.slice(0, 3).map(r => ({
        firm: r.legal_name,
        location: `${r.city}, ${r.state}`,
        aum: r.aum,
        similarity: r.similarity,
        executives: r.executives?.length || 0
      }))
    }
    
    console.log('🧪 Test Report:', testReport)
    
    return NextResponse.json(testReport, { headers: corsHeaders(req) })
    
  } catch (error) {
    console.error('Test endpoint error:', error)
    return NextResponse.json(
      { error: 'Test failed', details: error.message },
      { status: 500, headers: corsHeaders(req) }
    )
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Test endpoint ready. POST with {"query": "your test query"}'
  }, { headers: corsHeaders(req) })
}
