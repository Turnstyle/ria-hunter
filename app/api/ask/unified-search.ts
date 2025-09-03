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

// City variant generation for handling St. Louis and other city name variations
function generateCityVariants(rawCity?: string): string[] {
  if (!rawCity) return []
  const base = rawCity
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const t = base.toLowerCase()

  const variants = new Set<string>()

  // Base forms
  variants.add(titleCase(base))
  variants.add(base.toUpperCase())

  // Saint variants (St, St., Saint) with dotted and undotted forms
  if (/\bst\b|\bst\.|\bsaint\b/i.test(t)) {
    const saint = t.replace(/\bst\.?\s+/i, 'saint ').replace(/\bsaint\s+/i, 'saint ')
    const st = t.replace(/\bsaint\s+/i, 'st ').replace(/\bst\.?\s+/i, 'st ')
    // Explicit dotted shorthand (e.g., "St. Louis") to match DB entries that retain the period
    const stDot = t.replace(/\bsaint\s+/i, 'st. ').replace(/\bst\.?\s+/i, 'st. ')

    const saintTC = titleCase(saint)
    const stTC = titleCase(st)
    const stDotTC = titleCase(stDot)
    variants.add(saintTC)
    variants.add(stTC)
    variants.add(stDotTC)
    variants.add(saintTC.toUpperCase())
    variants.add(stTC.toUpperCase())
    variants.add(stDotTC.toUpperCase())
  }

  // Fort / Mount variants
  if (/\bft\b|\bft\.|\bfort\b/i.test(t)) {
    const fort = t.replace(/\bft\.?\s+/i, 'fort ')
    variants.add(titleCase(fort))
    variants.add(titleCase(fort).toUpperCase())
  }
  if (/\bmt\b|\bmt\.|\bmount\b/i.test(t)) {
    const mount = t.replace(/\bmt\.?\s+/i, 'mount ')
    variants.add(titleCase(mount))
    variants.add(titleCase(mount).toUpperCase())
  }

  // Super-loose: add punctuation-stripped and wildcard variants
  const tokenized = t.replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (tokenized) {
    const compact = tokenized.replace(/\s+/g, '') // saintlouis
    variants.add(titleCase(compact))
    variants.add(compact.toUpperCase())
  }

  // Synonym expansions for common metros
  const synonyms: Record<string, string[]> = {
    'saint louis': ['st louis', 'st. louis', 'st-louis', 'stl', 'saintlouis'],
    'new york': ['new york city', 'nyc', 'newyork', 'new-york'],
  }
  const key = tokenized
  const matchKey = Object.keys(synonyms).find((k) => key.includes(k))
  if (matchKey) {
    for (const syn of synonyms[matchKey]) {
      const tc = titleCase(syn)
      variants.add(tc)
      variants.add(tc.toUpperCase())
    }
  }

  return Array.from(variants)
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
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
    
    // STEP 1: Always attempt semantic search first
    const embedding = await generateVertex768Embedding(decomposition.semantic_query)
    
    if (!embedding || embedding.length !== 768) {
      throw new Error('Embedding generation failed')
    }
    
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`)
    
    // STEP 2: Get semantic matches with scores preserved
    const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: limit * 2  // Get extra for filtering
    })
    
    if (error) {
      console.error('RPC match_narratives error:', error)
      throw error
    }
    
    if (!semanticMatches || semanticMatches.length === 0) {
      console.warn('No semantic matches found, falling back to structured search')
      return executeStructuredFallback(filters, limit)
    }
    
    console.log(`🎯 Found ${semanticMatches.length} semantic matches`)
    
    // STEP 3: Get full profile data for matched CRDs
    let crdNumbers = semanticMatches.map(m => m.crd_number)
    
    let profileQuery = supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .in('crd_number', crdNumbers)
    
    // STEP 4: Apply structured filters to semantic results
    if (filters.state) {
      profileQuery = profileQuery.eq('state', filters.state)
    }
    if (filters.city) {
      const cityVariants = generateCityVariants(filters.city)
      if (cityVariants.length === 1) {
        profileQuery = profileQuery.ilike('city', `%${cityVariants[0]}%`)
      } else if (cityVariants.length > 1) {
        const cityConditions = cityVariants.map(c => `city.ilike.%${c}%`).join(',')
        profileQuery = profileQuery.or(cityConditions)
      }
    }
    if (filters.min_aum) {
      profileQuery = profileQuery.gte('aum', filters.min_aum)
    }
    
    const { data: profiles, error: profileError } = await profileQuery.limit(limit)
    
    if (profileError) {
      console.error('Profile query error:', profileError)
      throw profileError
    }
    
    if (!profiles || profiles.length === 0) {
      console.warn('Semantic matches filtered out by structured filters, trying fallback')
      return executeStructuredFallback(filters, limit)
    }
    
    // STEP 5: Merge similarity scores with profile data
    let resultsWithScores = profiles.map(profile => {
      const semanticMatch = semanticMatches.find(m => m.crd_number === profile.crd_number)
      return {
        ...profile,
        similarity: semanticMatch?.similarity || 0,
        source: 'semantic-first',
        searchStrategy: 'semantic-first'
      }
    }).sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

    // STEP 5b: Supplement with high-AUM local firms that don't have narratives (like Edward Jones)
    if ((filters.city || filters.state) && resultsWithScores.length < limit) {
      console.log(`🏢 Supplementing with high-AUM local firms without narratives...`)
      
      let supplementQuery = supabaseAdmin
        .from('ria_profiles')
        .select('*')
        .gte('aum', 1000000) // Only large firms (>$1M AUM)
      
      if (filters.state) {
        supplementQuery = supplementQuery.eq('state', filters.state)
      }
      
      if (filters.city) {
        const cityVariants = generateCityVariants(filters.city)
        if (cityVariants.length === 1) {
          supplementQuery = supplementQuery.ilike('city', `%${cityVariants[0]}%`)
        } else if (cityVariants.length > 1) {
          const orConditions = cityVariants.map(cv => `city.ilike.%${cv}%`).join(',')
          supplementQuery = supplementQuery.or(orConditions)
        }
      }
      
      // Exclude firms already in semantic results
      const existingCrds = resultsWithScores.map(r => r.crd_number)
      if (existingCrds.length > 0) {
        supplementQuery = supplementQuery.not('crd_number', 'in', `(${existingCrds.join(',')})`)
      }
      
      const { data: supplementalFirms } = await supplementQuery
        .order('aum', { ascending: false })
        .limit(limit - resultsWithScores.length)
      
      if (supplementalFirms && supplementalFirms.length > 0) {
        const supplementalResults = supplementalFirms.map(firm => ({
          ...firm,
          similarity: 0, // No semantic similarity
          source: 'geographic-supplement',
          searchStrategy: 'semantic-first'
        }))
        
        resultsWithScores = [...resultsWithScores, ...supplementalResults]
        console.log(`✅ Added ${supplementalFirms.length} high-AUM local firms without narratives`)
      }
    }

    // STEP 6: Enrich with executives
    console.log(`Enriching ${resultsWithScores.length} results with executives...`)
    const enrichedResults = await Promise.all(resultsWithScores.map(async (r) => {
      try {
        const { data: execs, error } = await supabaseAdmin
          .from('control_persons')
          .select('person_name, title')
          .eq('crd_number', r.crd_number)
          .limit(5)
        
        if (error) {
          console.warn(`Failed to fetch executives for CRD ${r.crd_number}:`, error.message)
        }
        
        return {
          ...r,
          executives: execs?.map(e => ({ 
            name: e.person_name, 
            title: e.title 
          })) || []
        }
      } catch (execError) {
        console.error(`Error enriching CRD ${r.crd_number}:`, execError)
        return {
          ...r,
          executives: []
        }
      }
    }))

    console.log(`✅ Returning ${enrichedResults.length} semantic + supplemental results`)
    return enrichedResults
    
  } catch (error) {
    console.warn('Semantic search failed, falling back to structured search:', error)
    return executeStructuredFallback(filters, limit)
  }
}

// Structured database search fallback
async function executeStructuredFallback(filters: { state?: string; city?: string; min_aum?: number }, limit: number) {
  try {
    console.log('📊 Executing structured fallback search...')
    
    let query = supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum')
    
    if (filters.state) {
      query = query.eq('state', filters.state)
    }
    
    if (filters.city) {
      const cityVariants = generateCityVariants(filters.city)
      if (cityVariants.length === 1) {
        query = query.ilike('city', `%${cityVariants[0]}%`)
      } else if (cityVariants.length > 1) {
        const orConditions = cityVariants.map(cv => `city.ilike.%${cv}%`).join(',')
        query = query.or(orConditions)
      }
    }
    
    if (filters.min_aum) {
      query = query.gte('aum', filters.min_aum)
    }
    
    // Default to ordering by AUM descending
    query = query.order('aum', { ascending: false }).limit(limit)
    
    const { data: rows, error } = await query
    
    if (error) {
      console.error('Structured fallback error:', error)
      return []
    }
    
    // NEW: Enrich with executives
    const enrichedResults = await Promise.all((rows || []).map(async (r) => {
      try {
        const { data: execs } = await supabaseAdmin
          .from('control_persons')
          .select('person_name, title')
          .eq('crd_number', r.crd_number)
          .limit(5)
        
        return {
          ...r,
          similarity: 0,
          source: 'structured-fallback',
          searchStrategy: 'structured-fallback',
          executives: execs?.map(e => ({ 
            name: e.person_name, 
            title: e.title 
          })) || []
        }
      } catch {
        return {
          ...r,
          similarity: 0,
          source: 'structured-fallback',
          searchStrategy: 'structured-fallback',
          executives: []
        }
      }
    }))
    
    console.log(`📊 Returning ${enrichedResults.length} enriched fallback results`)
    return enrichedResults
    
  } catch (error) {
    console.error('Structured fallback failed:', error)
    return []
  }
}

// Handle superlative queries (largest/smallest) with proven logic
async function handleSuperlativeQuery(decomposition: QueryPlan, limit = 10) {
  const isLargest = decomposition.semantic_query.toLowerCase().includes('largest') ||
                    decomposition.semantic_query.toLowerCase().includes('biggest') ||
                    decomposition.semantic_query.toLowerCase().includes('top ')
  const isSmallest = decomposition.semantic_query.toLowerCase().includes('smallest')
  
  // Try semantic search first, but if it fails, use the proven superlative logic
  try {
    const embedding = await generateVertex768Embedding(decomposition.semantic_query)
    if (embedding && embedding.length === 768) {
      const { data: semanticMatches, error } = await supabaseAdmin.rpc('match_narratives', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: limit * 2
      })
      
      if (!error && semanticMatches && semanticMatches.length > 0) {
        // Use semantic results with superlative sorting
        const crdNumbers = semanticMatches.map(m => m.crd_number)
        let q = supabaseAdmin.from('ria_profiles').select('*').in('crd_number', crdNumbers)
        
        // Apply filters from decomposition
        const filters = parseFiltersFromDecomposition(decomposition)
        if (filters.state) q = q.eq('state', filters.state)
        if (filters.city) {
          const cityVariants = generateCityVariants(filters.city)
          if (cityVariants.length > 0) {
            const orConditions = cityVariants.map(cv => `city.ilike.%${cv}%`).join(',')
            q = q.or(orConditions)
          }
        }
        
        q = q.order('aum', { ascending: !isLargest }).limit(limit)
        const { data: profiles } = await q
        
        if (profiles && profiles.length > 0) {
          // For superlative queries, ALWAYS check for high-AUM local firms to ensure we don't miss giants like Edward Jones
          console.log(`🏢 Merging semantic results with all high-AUM local firms for superlative query...`)
          
          let allHighAumQuery = supabaseAdmin
            .from('ria_profiles')
            .select('*')
            .gte('aum', 1000000) // Only large firms (>$1M AUM)
          
          if (filters.state) {
            allHighAumQuery = allHighAumQuery.eq('state', filters.state)
          }
          
          if (filters.city) {
            const cityVariants = generateCityVariants(filters.city)
            if (cityVariants.length === 1) {
              allHighAumQuery = allHighAumQuery.ilike('city', `%${cityVariants[0]}%`)
            } else if (cityVariants.length > 1) {
              const orConditions = cityVariants.map(cv => `city.ilike.%${cv}%`).join(',')
              allHighAumQuery = allHighAumQuery.or(orConditions)
            }
          }
          
          const { data: allHighAumFirms } = await allHighAumQuery
            .order('aum', { ascending: !isLargest })
            .limit(50) // Get top 50 by AUM, we'll trim later
          
          // Merge semantic and high-AUM results, prioritizing AUM for superlative queries
          const profilesMap = new Map()
          
          // Add semantic results with their similarity scores
          profiles.forEach(profile => {
            const semanticMatch = semanticMatches.find(m => m.crd_number === profile.crd_number)
            profilesMap.set(profile.crd_number, {
              ...profile,
              similarity: semanticMatch?.similarity || 0,
              source: 'semantic-superlative'
            })
          })
          
          // Add high-AUM firms (some may overlap with semantic results)
          if (allHighAumFirms && allHighAumFirms.length > 0) {
            allHighAumFirms.forEach(firm => {
              if (profilesMap.has(firm.crd_number)) {
                // Already in semantic results, keep semantic score
                const existing = profilesMap.get(firm.crd_number)
                profilesMap.set(firm.crd_number, { ...existing, ...firm })
              } else {
                // New high-AUM firm not in semantic results
                profilesMap.set(firm.crd_number, {
                  ...firm,
                  similarity: 0,
                  source: 'superlative-supplement'
                })
              }
            })
            console.log(`✅ Merged ${allHighAumFirms.length} high-AUM local firms with semantic results`)
          }
          
          // Convert back to array and sort by AUM for superlative queries
          const supplementedProfiles = Array.from(profilesMap.values())
            .sort((a, b) => isLargest ? (b.aum || 0) - (a.aum || 0) : (a.aum || 0) - (b.aum || 0))
            .slice(0, limit)
          
          // Enrich with executives
          const enrichedProfiles = await Promise.all(supplementedProfiles.map(async (profile) => {
            try {
              const { data: execs } = await supabaseAdmin
                .from('control_persons')
                .select('person_name, title')
                .eq('crd_number', profile.crd_number)
                .limit(5)
              
              const semanticMatch = semanticMatches.find(m => m.crd_number === profile.crd_number)
              
              return {
                ...profile,
                similarity: semanticMatch?.similarity || 0,
                source: semanticMatch ? 'semantic-superlative' : 'superlative-supplement',
                searchStrategy: 'semantic-superlative',
                executives: execs?.map(e => ({ 
                  name: e.person_name, 
                  title: e.title 
                })) || []
              }
            } catch {
              return {
                ...profile,
                similarity: semanticMatches.find(m => m.crd_number === profile.crd_number)?.similarity || 0,
                source: 'semantic-superlative',
                searchStrategy: 'semantic-superlative',
                executives: []
              }
            }
          }))
          return enrichedProfiles
        }
      }
    }
  } catch (error) {
    console.warn('Semantic superlative search failed, using direct approach:', error)
  }
  
  // Fallback to proven direct superlative query (from original executeEnhancedQuery)
  try {
    console.log('🎯 Using direct superlative query approach')
    
    const filters = parseFiltersFromDecomposition(decomposition)
    let q = supabaseAdmin.from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum')
    
    // Apply location filters
    if (filters.state) q = q.eq('state', filters.state)
    if (filters.city) {
      const cityVariants = generateCityVariants(filters.city)
      if (cityVariants.length === 1) {
        q = q.ilike('city', `%${cityVariants[0]}%`)
      } else if (cityVariants.length > 1) {
        const orConditions = cityVariants.map(cv => `city.ilike.%${cv}%`).join(',')
        q = q.or(orConditions)
      }
    }
    
    // Order by AUM and limit
    q = q.order('aum', { ascending: !isLargest }).limit(limit)
    const { data: rows, error } = await q
    
    if (error) {
      console.error('Direct superlative query error:', error)
      return []
    }
    
    // Enrich with executives
    const enrichedResults = await Promise.all((rows || []).map(async (r) => {
      try {
        const { data: execs } = await supabaseAdmin
          .from('control_persons')
          .select('person_name, title')
          .eq('crd_number', r.crd_number)
          .limit(5)
        
        return {
          ...r,
          similarity: 0,
          source: 'direct-superlative',
          searchStrategy: 'direct-superlative',
          executives: execs?.map(e => ({ 
            name: e.person_name, 
            title: e.title 
          })) || []
        }
      } catch {
        return {
          ...r,
          similarity: 0,
          source: 'direct-superlative',
          searchStrategy: 'direct-superlative',
          executives: []
        }
      }
    }))
    
    console.log(`✅ Direct superlative query returned ${enrichedResults.length} enriched results`)
    return enrichedResults
    
  } catch (error) {
    console.error('Superlative query failed completely:', error)
    return []
  }
}

// Classify query type
function classifyQueryType(decomposition: QueryPlan): string {
  const query = decomposition.semantic_query.toLowerCase()
  
  if (query.includes('largest') || query.includes('biggest') || query.includes('top ')) {
    return 'superlative-largest'
  }
  if (query.includes('smallest')) {
    return 'superlative-smallest'
  }
  if (decomposition.structured_filters?.location) {
    return 'geographic'
  }
  if (decomposition.structured_filters?.services?.some(s => s.toLowerCase().includes('private'))) {
    return 'service-specific'
  }
  
  return 'general-semantic'
}

// Calculate average confidence from results
function calculateAverageConfidence(results: any[]): number {
  if (!results || results.length === 0) return 0
  
  const similarities = results.map(r => r.similarity || 0).filter(s => s > 0)
  if (similarities.length === 0) return 0
  
  return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
}

// Fallback query decomposition when LLM fails
function fallbackDecompose(query: string): QueryPlan {
  const q = query.trim()
  
  // Extract location
  let city: string | undefined
  let state: string | undefined
  
  // Check for "St. Louis" specifically
  if (/\b(st\.?|saint)\s+louis\b/i.test(q)) {
    city = 'Saint Louis'
    state = 'MO'
  }
  
  // Extract state abbreviations
  const stateMatch = q.match(/\b([A-Z]{2})\b/)
  if (stateMatch && !state) {
    state = stateMatch[1]
  }
  
  // Extract city with "in" pattern
  const inCityMatch = q.match(/\bin\s+([A-Za-z.\s]+?)(?:,\s*[A-Za-z]{2}|$)/i)
  if (inCityMatch && !city) {
    city = inCityMatch[1].trim()
  }
  
  const location = city && state ? `${city}, ${state}` : city || state || null
  
  return {
    semantic_query: `Registered Investment Advisors ${location ? 'in ' + location : ''}`,
    structured_filters: {
      location,
      min_aum: null,
      max_aum: null,
      services: null
    }
  }
}

// Main unified semantic search function
export async function unifiedSemanticSearch(query: string, options: { limit?: number; threshold?: number } = {}) {
  const { limit = 10, threshold = 0.3 } = options
  
  console.log(`🔍 Starting unified semantic search for: "${query}"`)
  
  // ALWAYS decompose with AI first
  let decomposition: QueryPlan
  try {
    decomposition = await callLLMToDecomposeQuery(query)
    console.log('✅ LLM decomposition successful')
  } catch (error) {
    console.warn('LLM decomposition failed, using fallback:', error)
    decomposition = fallbackDecompose(query)
  }
  
  // Extract filters from decomposition
  const filters = parseFiltersFromDecomposition(decomposition)
  
  // Check if this is a superlative query
  const queryType = classifyQueryType(decomposition)
  let results: any[]
  
  if (queryType.startsWith('superlative')) {
    results = await handleSuperlativeQuery(decomposition, limit)
  } else {
    results = await executeSemanticQuery(decomposition, filters, limit)
  }
  
  const confidence = calculateAverageConfidence(results)
  
  console.log(`✅ Unified search complete: ${results.length} results, avg confidence: ${confidence.toFixed(2)}`)
  
  return {
    results,
    metadata: {
      searchStrategy: 'semantic-first',
      queryType,
      confidence,
      decomposition,
      filters,
      totalResults: results.length
    }
  }
}
