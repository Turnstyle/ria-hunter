import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callLLMToDecomposeQuery, type QueryPlan } from './planner-v2'
import { createAIService } from '@/lib/ai-providers'
import { cityMatchesFilter, createCityPattern, normalizeCityInput, normalizeStateInput } from './location-utils'

// Generate embedding using Vertex AI
async function generateVertex768Embedding(text: string): Promise<number[] | null> {
  try {
    const aiService = createAIService()
    
    if (!aiService) {
      console.error('❌ Failed to create AI service - check credentials configuration')
      return null
    }
    
    const result = await aiService.generateEmbedding(text)
    
    if (!result || !result.embedding || result.embedding.length !== 768) {
      console.error(`❌ Invalid embedding result: ${result?.embedding?.length || 0} dimensions`)
      return null
    }
    
    console.log(`✅ Generated ${result.embedding.length}-dimensional embedding`)
    return result.embedding
    
  } catch (error) {
    console.error('❌ Embedding generation failed:', error)
    return null
  }
}

type SearchFilters = {
  state?: string | null
  city?: string | null
  min_aum?: number | null
  cityPattern?: string | null
}

// Parse filters from decomposition
function parseFiltersFromDecomposition(decomposition: QueryPlan): SearchFilters {
  const filters: SearchFilters = {}
  
  const structured = decomposition.structured_filters || {}

  if (structured.state) {
    filters.state = structured.state
  }

  if (structured.city) {
    filters.city = structured.city
  }

  if (structured.location && (!filters.city || !filters.state)) {
    const parts = structured.location.split(',').map(p => p.trim()).filter(Boolean)
    if (!filters.city && parts[0]) {
      filters.city = parts[0]
    }
    if (!filters.state && parts[1]) {
      filters.state = parts[1]
    }
  }
  
  if (typeof structured.min_aum === 'number') {
    filters.min_aum = structured.min_aum
  }
  
  return filters
}

// Execute semantic-first search with fallbacks
async function executeSemanticQuery(decomposition: QueryPlan, filters: SearchFilters = {}, limit = 10) {
  try {
    console.log('🧠 Starting semantic-first search...')
    console.log('📝 Decomposition:', decomposition)
    console.log('🔍 Filters:', filters)
    
    // STEP 1: Always attempt semantic search first
    const embedding = await generateVertex768Embedding(decomposition.semantic_query)
    
    if (!embedding || embedding.length !== 768) {
      console.error(`❌ Embedding generation failed. Got ${embedding?.length || 0} dimensions instead of 768`)
      throw new Error(`Embedding generation failed: ${embedding?.length || 0} dimensions`)
    }
    
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`)
    console.log(`📊 First 5 embedding values:`, embedding.slice(0, 5))
    
    // STEP 2: Use hybrid_search_rias RPC which combines semantic and full-text search with proper state filtering
    console.log('🔄 Calling hybrid_search_rias with params:', {
      query_text: decomposition.semantic_query,
      embedding_length: embedding.length,
      match_threshold: 0.3,
      match_count: limit * 2,
      state_filter: filters.state || null,
      min_vc_activity: 0,
      min_aum: filters.min_aum || 0
    })
    
    // Call the native function directly with the embedding array
    // Supabase client will handle the array-to-vector conversion
    // Trust semantic embeddings to understand location completely - no rigid state filtering!
    const { data: searchResults, error } = await supabaseAdmin.rpc('hybrid_search_rias', {
      query_text: decomposition.semantic_query,
      query_embedding: embedding,  // Pass as array directly
      match_threshold: 0.3,
      match_count: limit * 2,
      state_filter: null,  // Let AI embeddings handle location naturally
      min_vc_activity: 0,
      min_aum: filters.min_aum || 0,
      fund_type_filter: filters.fundType || null
    })
    
    if (error) {
      console.error('❌ RPC hybrid_search_rias error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      throw error
    }
    
    console.log(`📊 RPC returned ${searchResults?.length || 0} results`)
    
    if (!searchResults || searchResults.length === 0) {
      console.warn('⚠️ No semantic matches found from hybrid_search_rias')
      return []
    }
    
    // STEP 3: Trust semantic search to understand location naturally
    // The embeddings in the query "largest RIAs in St. Louis" will naturally match
    // narratives that mention St. Louis - no rigid filtering needed!
    let filteredResults = searchResults
    console.log(`🧠 Trusting AI embeddings to understand location naturally`)
    
    if (filters.city) {
      filteredResults = filteredResults.filter((ria: any) => cityMatchesFilter(ria.city, filters.city))
      console.log(`🏙️ Applied city filter "${filters.city}", ${filteredResults.length} results remain`)
    }
    
    if (filters.state) {
      filteredResults = filteredResults.filter((ria: any) => (ria.state || '').toUpperCase() === filters.state)
      console.log(`🗺️ Applied state filter "${filters.state}", ${filteredResults.length} results remain`)
    }
    
    // STEP 4: Apply AI-determined sorting
    // The AI planner tells us HOW to sort based on understanding the query naturally
    const sortBy = decomposition.structured_filters?.sort_by || 'relevance'
    console.log(`📊 AI determined sort strategy: ${sortBy}`)
    
    if (sortBy === 'aum') {
      filteredResults.sort((a: any, b: any) => (b.aum || 0) - (a.aum || 0))
    } else if (sortBy === 'fund_count') {
      filteredResults.sort((a: any, b: any) => (b.private_fund_count || 0) - (a.private_fund_count || 0))
    } else if (sortBy === 'name') {
      filteredResults.sort((a: any, b: any) => (a.legal_name || '').localeCompare(b.legal_name || ''))
    }
    // If sort_by === 'relevance', keep semantic similarity order
    
    // STEP 5: Deduplicate by CRD number before limiting
    const deduped = new Map<number, any>()
    filteredResults.forEach((ria: any) => {
      const existing = deduped.get(ria.crd_number)
      if (!existing || (ria.aum || 0) > (existing.aum || 0)) {
        deduped.set(ria.crd_number, ria)
      }
    })
    
    const uniqueResults = Array.from(deduped.values())
    console.log(`📊 After deduplication: ${uniqueResults.length} unique firms from ${filteredResults.length} total`)
    
    // STEP 6: Limit results to requested amount
    const finalResults = uniqueResults.slice(0, limit)
    console.log(`✅ Semantic search complete: ${finalResults.length} results`)
    
    return finalResults
    
  } catch (error) {
    console.error('❌ Semantic query failed:', error)
    throw error
  }
}

// Execute structured database query (no semantic search)
async function executeStructuredQuery(
  filters: SearchFilters & { fundType?: string | null } = {},
  limit = 10
) {
  try {
    console.log('📊 Starting structured database query...')
    console.log('Filters:', filters)
    
    // Query with filters, get extra results to account for duplicates
    let query = supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .order('aum', { ascending: false, nullsFirst: false })
      .limit(limit * 3) // Get more results to account for potential duplicates
    
    if (filters.state) {
      console.log(`  Adding state filter: ${filters.state}`)
      query = query.eq('state', filters.state.toUpperCase())
    }
    
    if (filters.cityPattern) {
      console.log(`  Adding city pattern filter: ${filters.cityPattern}`)
      query = query.ilike('city', filters.cityPattern)
    } else if (filters.city) {
      console.log(`  Adding city filter: ${filters.city}`)
      query = query.ilike('city', `%${filters.city}%`)
    }
    
    if (filters.min_aum) {
      console.log(`  Adding min AUM filter: ${filters.min_aum}`)
      query = query.gte('aum', filters.min_aum)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('❌ Structured query error:', error)
      throw error
    }
    
    if (!data || data.length === 0) {
      console.log('✅ Structured query complete: 0 results')
      return []
    }
    
    // Log raw data before deduplication
    console.log(`  Raw data (first 3):`, data.slice(0, 3).map(r => ({
      crd: r.crd_number,
      name: r.legal_name,
      city: r.city,
      aum: r.aum
    })))
    
    // Manually deduplicate by CRD number, keeping the one with highest AUM
    console.log(`  Deduplicating ${data.length} results...`)
    const deduped = new Map<number, any>()
    data.forEach(ria => {
      const existing = deduped.get(ria.crd_number)
      if (!existing || (ria.aum || 0) > (existing.aum || 0)) {
        deduped.set(ria.crd_number, ria)
      }
    })
    
    console.log(`  After deduplication: ${deduped.size} unique CRD numbers`)
    
    // Sort by AUM descending and limit to requested count
    const results = Array.from(deduped.values())
      .sort((a, b) => (b.aum || 0) - (a.aum || 0))
      .slice(0, limit)
    
    console.log(`  Final results (first 5):`, results.slice(0, 5).map(r => ({
      crd: r.crd_number,
      name: r.legal_name,
      aum: r.aum
    })))
    
    console.log(`✅ Structured query complete (deduplicated): ${results.length} unique results from ${data.length} total`)
    return results
    
  } catch (error) {
    console.error('❌ Structured query failed:', error)
    throw error
  }
}

// Calculate average confidence score
function calculateAverageConfidence(results: any[]): number {
  if (!results || results.length === 0) return 0
  const scores = results.filter(r => r.similarity_score).map(r => r.similarity_score)
  if (scores.length === 0) return 0.5
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

// Main unified semantic search function
export async function unifiedSemanticSearch(query: string, options: { 
  limit?: number; 
  threshold?: number;
  structuredFilters?: { state?: string | null; city?: string | null; fundType?: string | null; min_aum?: number | null; minAum?: number | null };
  decomposition?: QueryPlan | null;
} = {}) {
  const { limit = 10, structuredFilters = {}, decomposition: providedPlan = null } = options
  
  console.log(`🔍 Starting unified semantic search for: "${query}"`)
  console.log(`📋 Structured filters:`, structuredFilters)
  
  // Use provided decomposition when available to avoid duplicate LLM calls
  const decomposition = providedPlan || await callLLMToDecomposeQuery(query)
  console.log('✅ AI decomposition successful')
  
  // Extract filters from decomposition and merge with structured filters
  const decomposedFilters = parseFiltersFromDecomposition(decomposition)
  const mergedFilters = {
    ...decomposedFilters,
    ...structuredFilters
  }

  // Support both camelCase and snake_case min AUM
  if (structuredFilters.minAum !== undefined && structuredFilters.min_aum === undefined) {
    mergedFilters.min_aum = structuredFilters.minAum
  }
  
  const normalizedState = normalizeStateInput(mergedFilters.state || null)
  const normalizedCity = normalizeCityInput(mergedFilters.city || null)
  
  const filters: SearchFilters & { fundType?: string | null } = {
    ...mergedFilters,
    state: normalizedState,
    city: normalizedCity,
    cityPattern: createCityPattern(normalizedCity),
    min_aum: mergedFilters.min_aum ?? null,
    fundType: mergedFilters.fundType ?? null
  }
  
  console.log(`🔀 Merged filters:`, JSON.stringify(filters, null, 2))
  
  let results: any[] = []
  let searchStrategy = 'semantic'
  const sortBy = decomposition.structured_filters?.sort_by || 'relevance'
  
  if (sortBy === 'aum') {
    console.log('🏆 Sort strategy is AUM - prioritizing structured query for accuracy')
    results = await executeStructuredQuery(filters, limit)
    searchStrategy = 'structured_aum'
    
    if (results.length === 0) {
      console.log('⚠️ Structured query returned no results - falling back to semantic search')
      try {
        results = await executeSemanticQuery(decomposition, filters, limit)
        searchStrategy = 'semantic_fallback'
      } catch (semanticError) {
        console.warn('⚠️ Semantic search also failed:', semanticError)
      }
    }
  } else {
    console.log('🔄 Using SEMANTIC search with AI embeddings')
    try {
      results = await executeSemanticQuery(decomposition, filters, limit)
    } catch (semanticError) {
      console.warn('⚠️ Semantic search failed, falling back to structured:', semanticError)
      searchStrategy = 'structured_fallback'
      results = await executeStructuredQuery(filters, limit)
    }
  }
  
  // Fetch additional data for each RIA
  if (results.length > 0) {
    const crdNumbers = results.map(r => r.crd_number).filter(Boolean)
    
    // Fetch executives
    const { data: allExecutives } = await supabaseAdmin
      .from('executives')
      .select('*')
      .in('crd_number', crdNumbers)
    
    // Fetch private funds
    const { data: allFunds } = await supabaseAdmin
      .from('ria_private_funds')
      .select('*')
      .in('crd_number', crdNumbers)
    
    // Map executives and funds to their respective RIAs
    results = results.map(ria => ({
      ...ria,
      executives: allExecutives?.filter(exec => exec.crd_number === ria.crd_number) || [],
      private_funds: allFunds?.filter(fund => fund.crd_number === ria.crd_number) || []
    }))
  }
  
  // Calculate confidence based on similarity scores if available
  const avgConfidence = calculateAverageConfidence(results)
  
  return {
    results,
    metadata: {
      searchStrategy,
      query: decomposition.semantic_query,
      filters,
      resultCount: results.length,
      confidence: avgConfidence
    }
  }
}
