import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callLLMToDecomposeQuery } from './planner'
import type { QueryPlan } from './planner'
import { createAIService } from '@/lib/ai-providers'

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
    
    // Call the native function directly with the embedding array
    // Supabase client will handle the array-to-vector conversion
    const { data: searchResults, error } = await supabaseAdmin.rpc('hybrid_search_rias', {
      query_text: decomposition.semantic_query,
      query_embedding: embedding,  // Pass as array directly
      match_threshold: 0.3,
      match_count: limit * 2,
      state_filter: filters.state || null,
      min_vc_activity: 0,
      min_aum: filters.min_aum || 0,
      fund_type_filter: null
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
    
    // Build WHERE clause conditions
    const conditions: string[] = []
    if (filters.state) {
      console.log(`  Adding state filter: ${filters.state}`)
      conditions.push(`state = '${filters.state.toUpperCase()}'`)
    }
    
    if (filters.city) {
      console.log(`  Adding city filter: ${filters.city}`)
      conditions.push(`city ILIKE '%${filters.city}%'`)
    }
    
    if (filters.min_aum) {
      console.log(`  Adding min AUM filter: ${filters.min_aum}`)
      conditions.push(`aum >= ${filters.min_aum}`)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    // Use DISTINCT ON to get only one row per CRD number (the one with highest AUM)
    // This prevents duplicates when the same company has multiple entries
    const query = `
      SELECT DISTINCT ON (crd_number) *
      FROM ria_profiles
      ${whereClause}
      ORDER BY crd_number, aum DESC NULLS LAST
      LIMIT ${limit * 2}
    `
    
    console.log('  Executing SQL:', query)
    
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { query })
    
    // If RPC doesn't work, fall back to regular query without deduplication
    if (error) {
      console.warn('⚠️ RPC query failed, using standard query:', error)
      
      let standardQuery = supabaseAdmin
        .from('ria_profiles')
        .select('*')
        .order('aum', { ascending: false, nullsFirst: false })
        .limit(limit * 3) // Get more results to account for potential duplicates
      
      if (filters.state) {
        standardQuery = standardQuery.eq('state', filters.state.toUpperCase())
      }
      
      if (filters.city) {
        standardQuery = standardQuery.ilike('city', `%${filters.city}%`)
      }
      
      if (filters.min_aum) {
        standardQuery = standardQuery.gte('aum', filters.min_aum)
      }
      
      const { data: standardData, error: standardError } = await standardQuery
      
      if (standardError) {
        console.error('❌ Structured query error:', standardError)
        throw standardError
      }
      
      // Manually deduplicate by CRD number, keeping the one with highest AUM
      const deduped = new Map<number, any>()
      standardData?.forEach(ria => {
        const existing = deduped.get(ria.crd_number)
        if (!existing || (ria.aum || 0) > (existing.aum || 0)) {
          deduped.set(ria.crd_number, ria)
        }
      })
      
      const results = Array.from(deduped.values())
        .sort((a, b) => (b.aum || 0) - (a.aum || 0))
        .slice(0, limit)
      
      console.log(`✅ Structured query complete (deduplicated): ${results.length} unique results`)
      return results
    }
    
    // Sort by AUM and limit
    const results = (data || [])
      .sort((a: any, b: any) => (b.aum || 0) - (a.aum || 0))
      .slice(0, limit)
    
    console.log(`✅ Structured query complete: ${results.length} results`)
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
