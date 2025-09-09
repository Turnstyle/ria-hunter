import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callLLMToDecomposeQuery } from './planner'
import type { QueryPlan } from './planner'
import { createAIService, getAIProvider } from '@/lib/ai-providers'

// Generate embedding using the configured AI provider (supports both Vertex and OpenAI)
async function generateVertex768Embedding(text: string): Promise<number[] | null> {
  try {
    const provider = getAIProvider() // This will return 'vertex' when AI_PROVIDER=google
    console.log(`🔧 Using AI provider: ${provider} for embeddings`)
    
    const aiService = createAIService({ provider })
    
    if (!aiService) {
      console.error('❌ Failed to create AI service - check credentials configuration')
      console.log('Environment check:', {
        AI_PROVIDER: process.env.AI_PROVIDER,
        GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: !!process.env.GOOGLE_CLOUD_PROJECT,
        GOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY
      })
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

// Parse filters from decomposition
function parseFiltersFromDecomposition(decomposition: QueryPlan): { state?: string; city?: string; min_aum?: number } {
  const filters: { state?: string; city?: string; min_aum?: number } = {}
  
  const location = decomposition.structured_filters?.location
  if (location) {
    const parts = location.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length === 2) {
      filters.city = parts[0]
      filters.state = parts[1].toUpperCase()
    } else if (parts.length === 1) {
      // Check if it's a state code
      if (parts[0].length === 2) {
        filters.state = parts[0].toUpperCase()
      } else {
        filters.city = parts[0]
      }
    }
  }
  
  if (decomposition.structured_filters?.min_aum) {
    filters.min_aum = decomposition.structured_filters.min_aum
  }
  
  return filters
}

// Execute semantic-first search with fallbacks
async function executeSemanticQuery(decomposition: QueryPlan, filters: { state?: string; city?: string; min_aum?: number } = {}, limit = 10) {
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
    
    // Convert embedding array to JSON string for the RPC function
    const embeddingString = JSON.stringify(embedding);
    
    const { data: searchResults, error } = await supabaseAdmin.rpc('hybrid_search_rias_with_string_embedding', {
      query_text: decomposition.semantic_query,  // Pass the text query for full-text search
      query_embedding_string: embeddingString,  // Pass as JSON string
      match_threshold: 0.3,
      match_count: limit * 2,  // Get extra for city filtering if needed
      state_filter: filters.state || null,
      min_vc_activity: 0,
      min_aum: filters.min_aum || 0
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
    
    // STEP 3: Post-filter by city if needed (using simple contains check)
    let filteredResults = searchResults
    if (filters.city) {
      console.log(`🏙️ Filtering by city: ${filters.city}`)
      // Simple city filter - let the semantic search handle variations
      const cityLower = filters.city.toLowerCase()
      filteredResults = searchResults.filter((ria: any) => {
        const profileCity = (ria.city || '').toLowerCase()
        return profileCity.includes(cityLower)
      })
      console.log(`  After city filter: ${filteredResults.length} results`)
    }
    
    // STEP 4: Limit results to requested amount
    const finalResults = filteredResults.slice(0, limit)
    console.log(`✅ Semantic search complete: ${finalResults.length} results`)
    
    return finalResults
    
  } catch (error) {
    console.error('❌ Semantic query failed:', error)
    throw error
  }
}

// Execute structured database query (no semantic search)
async function executeStructuredQuery(
  filters: { state?: string; city?: string; min_aum?: number; fundType?: string } = {},
  limit = 10
) {
  try {
    console.log('📊 Starting structured database query...')
    console.log('Filters:', filters)
    
    let query = supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .order('aum', { ascending: false })
      .limit(limit)
    
    if (filters.state) {
      console.log(`  Adding state filter: ${filters.state}`)
      query = query.eq('state', filters.state.toUpperCase())
    }
    
    if (filters.city) {
      console.log(`  Adding city filter: ${filters.city}`)
      // Simple ilike for city - no variants needed, let the database handle it
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
    
    console.log(`✅ Structured query complete: ${data?.length || 0} results`)
    return data || []
    
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
  structuredFilters?: { state?: string; city?: string; fundType?: string };
  forceStructured?: boolean;
} = {}) {
  const { limit = 10, threshold = 0.3, structuredFilters = {}, forceStructured = false } = options
  
  console.log(`🔍 Starting unified semantic search for: "${query}"`)
  console.log(`📋 Structured filters:`, structuredFilters)
  console.log(`🎯 Force structured search:`, forceStructured)
  
  // ALWAYS decompose with AI - no fallbacks
  const decomposition = await callLLMToDecomposeQuery(query)
  console.log('✅ AI decomposition successful')
  
  // Extract filters from decomposition and merge with structured filters
  const decomposedFilters = parseFiltersFromDecomposition(decomposition)
  // IMPORTANT: structuredFilters (from route.ts) should override decomposed filters
  const filters = {
    ...decomposedFilters,
    ...structuredFilters, // This spreads all structuredFilters, overriding decomposed ones
  }
  
  console.log(`🔀 Merged filters:`, JSON.stringify(filters, null, 2))
  
  // Decision: Use structured search for location-based superlative queries
  const isSuperlativeQuery = /\b(largest|biggest|top\s+\d+|leading|major)\b/i.test(query)
  const hasLocationFilter = !!(filters.state || filters.city)
  const shouldUseStructured = forceStructured || (isSuperlativeQuery && hasLocationFilter)
  
  console.log(`📊 Query analysis:`)
  console.log(`  - Is superlative: ${isSuperlativeQuery}`)
  console.log(`  - Has location: ${hasLocationFilter}`)
  console.log(`  - Should use structured: ${shouldUseStructured}`)
  
  let results: any[] = []
  let searchStrategy = 'semantic'
  
  if (shouldUseStructured) {
    // Use structured database query for location-based superlatives
    console.log('🔄 Using STRUCTURED search strategy')
    searchStrategy = 'structured'
    results = await executeStructuredQuery(filters, limit)
  } else {
    // Use semantic search for everything else
    console.log('🔄 Using SEMANTIC search strategy')
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
      .from('private_funds')
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