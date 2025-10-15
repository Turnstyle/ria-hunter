import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';
import { createAIService } from '@/lib/ai-providers';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Generate embedding using Vertex AI
async function generateVertex768Embedding(text: string): Promise<number[] | null> {
  try {
    const aiService = createAIService();
    
    if (!aiService) {
      console.error('Failed to create AI service - check credentials configuration');
      return null;
    }
    
    const result = await aiService.generateEmbedding(text);
    
    if (!result || !result.embedding || result.embedding.length !== 768) {
      console.error(`Invalid embedding result: ${result?.embedding?.length || 0} dimensions`);
      return null;
    }
    
    console.log(`Generated ${result.embedding.length}-dimensional embedding`);
    return result.embedding;
    
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
}

/**
 * Hybrid Comprehensive Search Endpoint
 * 
 * This endpoint combines:
 * 1. Comprehensive database retrieval (gets ALL matching RIAs)
 * 2. Semantic search ranking (uses embeddings to rank by relevance)
 * 3. AI-powered understanding (maintains RAG capabilities)
 * 
 * Best of both worlds: Complete results + Intelligent ranking
 */
export async function POST(req: NextRequest) {
  const requestId = `hybrid-search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === HYBRID COMPREHENSIVE SEARCH ===`);
  
  try {
    const body = await req.json();
    const { 
      query = '',
      filters = {},
      limit = 100,  // Final result limit after ranking
      semanticWeight = 0.7,  // How much to weight semantic relevance (0-1)
      databaseWeight = 0.3   // How much to weight database metrics like AUM
    } = body;

    // Extract filters
    const { state, city, fundType, minAum, hasVcActivity } = filters;

    console.log(`[${requestId}] Query: "${query}"`);
    console.log(`[${requestId}] Filters:`, filters);
    console.log(`[${requestId}] Weights: Semantic=${semanticWeight}, Database=${databaseWeight}`);

    // Use the filters as provided - trust the AI to extract them properly
    let extractedState = state;
    let extractedCity = city;
    let extractedFundType = fundType;

    // STEP 1: Get ALL matching RIAs from database (comprehensive)
    console.log(`[${requestId}] Step 1: Retrieving all matching RIAs from database...`);
    
    let dbQuery = supabaseAdmin
      .from('ria_profiles')
      .select(`
        crd_number,
        legal_name,
        city,
        state,
        aum,
        private_fund_count,
        private_fund_aum,
        phone,
        website,
        fax,
        cik,
        narratives!inner(
          narrative,
          embedding_vector
        ),
        control_persons(person_name, title),
        ria_private_funds(
          fund_name,
          fund_type,
          gross_asset_value
        )
      `);

    // Apply filters
    if (extractedState || state) {
      const stateFilter = (extractedState || state).toUpperCase();
      dbQuery = dbQuery.eq('state', stateFilter);
    }

    if (extractedCity || city) {
      const cityFilter = extractedCity || city;
      if (cityFilter.toLowerCase().includes('st') && cityFilter.toLowerCase().includes('louis')) {
        dbQuery = dbQuery.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%');
      } else {
        dbQuery = dbQuery.ilike('city', `%${cityFilter}%`);
      }
    }

    if (minAum) {
      dbQuery = dbQuery.gte('aum', minAum);
    }

    // Get up to 2000 RIAs for comprehensive coverage
    dbQuery = dbQuery.limit(2000);

    const { data: allRIAs, error } = await dbQuery;

    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return corsError(req, 'Database query failed', 500);
    }

    console.log(`[${requestId}] Retrieved ${allRIAs?.length || 0} RIAs from database`);

    // STEP 2: Filter by fund type if needed
    let filteredRIAs = allRIAs || [];
    
    if (extractedFundType || fundType || hasVcActivity) {
      const targetFundType = extractedFundType || fundType;
      
      filteredRIAs = filteredRIAs.filter(ria => {
        if (!ria.ria_private_funds || ria.ria_private_funds.length === 0) {
          return false;
        }
        
        const hasVcPeActivity = ria.ria_private_funds.some((fund: any) => {
          const fundTypeStr = (fund.fund_type || '').toLowerCase();
          return fundTypeStr.includes('venture') || 
                 fundTypeStr.includes('vc') || 
                 fundTypeStr.includes('private equity') || 
                 fundTypeStr.includes('pe');
        });

        if (hasVcActivity && !targetFundType) {
          return hasVcPeActivity;
        }

        if (targetFundType) {
          const fundTypeLower = targetFundType.toLowerCase();
          return ria.ria_private_funds.some((fund: any) => {
            const fundTypeStr = (fund.fund_type || '').toLowerCase();
            
            if (fundTypeLower.includes('venture') || fundTypeLower === 'vc') {
              return fundTypeStr.includes('venture') || fundTypeStr.includes('vc');
            }
            if (fundTypeLower.includes('private equity') || fundTypeLower === 'pe') {
              return fundTypeStr.includes('private equity') || fundTypeStr.includes('pe');
            }
            return fundTypeStr.includes(fundTypeLower);
          });
        }

        return hasVcPeActivity;
      });

      console.log(`[${requestId}] After fund filtering: ${filteredRIAs.length} RIAs`);
    }

    // STEP 3: Use semantic search to rank results if we have a meaningful query
    let rankedResults = filteredRIAs;
    
    if (query && query.trim().length > 0) {
      console.log(`[${requestId}] Step 3: Using semantic search to rank results...`);
      
      // Get embedding for the query
      try {
        // Generate embedding for the query
        const queryEmbedding = await generateVertex768Embedding(query);
        
        if (!queryEmbedding || queryEmbedding.length !== 768) {
          console.warn(`[${requestId}] Failed to generate embedding, falling back to database ranking`);
          // Fall back to AUM-based ranking
          rankedResults.sort((a, b) => (b.aum || 0) - (a.aum || 0));
        } else {
          // Call the existing search_rias or hybrid_search_rias function to get semantic scores
          const targetFundType = extractedFundType || fundType;
          const { data: semanticResults, error: semanticError } = await supabaseAdmin.rpc(
            'hybrid_search_rias',
            {
              query_text: query,
              query_embedding: queryEmbedding,
              match_threshold: 0.1,  // Low threshold to include more results
              match_count: Math.min(filteredRIAs.length, 500),
              state_filter: extractedState || state || null,
              min_vc_activity: 0,
              min_aum: minAum || 0,
              fund_type_filter: targetFundType || null
            }
          );

          if (!semanticError && semanticResults) {
            console.log(`[${requestId}] Got ${semanticResults.length} semantic search results`);
            
            // Create a map of CRD to semantic score
            const semanticScores = new Map();
            semanticResults.forEach((result: any, index: number) => {
              // Higher rank = lower index = better score
              const score = 1 - (index / semanticResults.length);
              semanticScores.set(result.crd_number, {
                similarity: result.similarity || 0,
                textRank: result.text_rank || 0,
                rankScore: score
              });
            });

            // Combine database results with semantic scores
            rankedResults = filteredRIAs.map(ria => {
              const semanticData = semanticScores.get(ria.crd_number);
              const hasSemanticScore = semanticData !== undefined;
              
              // Calculate database score based on AUM and fund count
              const maxAum = Math.max(...filteredRIAs.map(r => r.aum || 0));
              const aumScore = maxAum > 0 ? (ria.aum || 0) / maxAum : 0;
              const fundScore = (ria.private_fund_count || 0) / 100; // Normalize to 0-1
              const databaseScore = (aumScore * 0.7 + fundScore * 0.3);
              
              // Calculate combined score
              let combinedScore;
              if (hasSemanticScore) {
                // Use weighted combination of semantic and database scores
                const semanticScore = semanticData.rankScore;
                combinedScore = (semanticScore * semanticWeight) + (databaseScore * databaseWeight);
              } else {
                // No semantic score, use database score with penalty
                combinedScore = databaseScore * 0.3; // Penalize items without semantic match
              }

              return {
                ...ria,
                semantic_similarity: semanticData?.similarity || 0,
                semantic_text_rank: semanticData?.textRank || 0,
                semantic_rank_score: semanticData?.rankScore || 0,
                database_score: databaseScore,
                combined_score: combinedScore,
                has_semantic_match: hasSemanticScore
              };
            });

            // Sort by combined score
            rankedResults.sort((a, b) => b.combined_score - a.combined_score);
            
            console.log(`[${requestId}] Ranked ${rankedResults.length} results by combined score`);
          } else {
            console.log(`[${requestId}] Semantic search failed, using database ranking only`);
            // Fall back to AUM-based ranking
            rankedResults.sort((a, b) => (b.aum || 0) - (a.aum || 0));
          }
        }
      } catch (semanticError) {
        console.error(`[${requestId}] Semantic ranking error:`, semanticError);
        // Fall back to AUM-based ranking
        rankedResults.sort((a, b) => (b.aum || 0) - (a.aum || 0));
      }
    } else {
      // No query provided, sort by AUM
      console.log(`[${requestId}] No query provided, sorting by AUM`);
      rankedResults.sort((a, b) => (b.aum || 0) - (a.aum || 0));
    }

    // STEP 4: Format and limit results
    const finalResults = rankedResults.slice(0, limit).map(ria => {
      // Analyze fund types
      const fundTypes = new Set<string>();
      const fundsByType: Record<string, number> = {};
      let totalFundAum = 0;
      let vcFundCount = 0;
      let peFundCount = 0;

      (ria.ria_private_funds || []).forEach((fund: any) => {
        if (fund.fund_type) {
          fundTypes.add(fund.fund_type);
          fundsByType[fund.fund_type] = (fundsByType[fund.fund_type] || 0) + 1;
          
          const fundTypeLower = fund.fund_type.toLowerCase();
          if (fundTypeLower.includes('venture') || fundTypeLower.includes('vc')) {
            vcFundCount++;
          }
          if (fundTypeLower.includes('private equity') || fundTypeLower.includes('pe')) {
            peFundCount++;
          }
        }
        if (fund.gross_asset_value) {
          totalFundAum += Number(fund.gross_asset_value);
        }
      });

      const executives = (ria.control_persons || []).map((person: any) => ({
        name: person.person_name,
        title: person.title
      }));

      return {
        crd_number: ria.crd_number,
        legal_name: ria.legal_name,
        city: ria.city,
        state: ria.state,
        aum: ria.aum || 0,
        private_fund_count: ria.private_fund_count || 0,
        private_fund_aum: ria.private_fund_aum || totalFundAum,
        website: ria.website,
        phone: ria.phone,
        narrative: ria.narratives?.[0]?.narrative,
        executives,
        funds: (ria.ria_private_funds || []).slice(0, 5).map((fund: any) => ({
          name: fund.fund_name,
          type: fund.fund_type,
          aum: fund.gross_asset_value
        })),
        fund_types: Array.from(fundTypes),
        vc_fund_count: vcFundCount,
        pe_fund_count: peFundCount,
        has_vc_activity: vcFundCount > 0 || peFundCount > 0,
        // Include scoring metadata for transparency
        relevance_scores: {
          semantic_similarity: ria.semantic_similarity || 0,
          semantic_rank: ria.semantic_rank_score || 0,
          database_score: ria.database_score || 0,
          combined_score: ria.combined_score || 0,
          has_semantic_match: ria.has_semantic_match || false
        }
      };
    });

    // Calculate summary statistics from ALL filtered results (not just final)
    const allVcPeFirms = rankedResults.filter(r => {
      return (r.ria_private_funds || []).some((fund: any) => {
        const ft = (fund.fund_type || '').toLowerCase();
        return ft.includes('venture') || ft.includes('vc') || 
               ft.includes('private equity') || ft.includes('pe');
      });
    });

    const summary = {
      total_database_results: allRIAs?.length || 0,
      total_filtered_results: filteredRIAs.length,
      total_with_semantic_match: rankedResults.filter(r => r.has_semantic_match).length,
      total_returned: finalResults.length,
      total_vc_pe_firms: allVcPeFirms.length,
      search_strategy: query ? 'hybrid-semantic-database' : 'database-only',
      ranking_method: query ? 'semantic-database-combined' : 'aum-based',
      semantic_weight: semanticWeight,
      database_weight: databaseWeight
    };

    // Build response
    const response = {
      success: true,
      query,
      filters: {
        state: extractedState || state,
        city: extractedCity || city,
        fundType: extractedFundType || fundType,
        hasVcActivity,
        minAum
      },
      summary,
      results: finalResults,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        searchStrategy: 'hybrid-comprehensive',
        note: 'Combines comprehensive database retrieval with semantic ranking for complete and intelligent results'
      }
    };

    console.log(`[${requestId}] === SEARCH COMPLETE ===`);
    console.log(`[${requestId}] Database Results: ${summary.total_database_results}`);
    console.log(`[${requestId}] Filtered Results: ${summary.total_filtered_results}`);
    console.log(`[${requestId}] Semantic Matches: ${summary.total_with_semantic_match}`);
    console.log(`[${requestId}] Returned Results: ${summary.total_returned}`);
    
    return NextResponse.json(response, { headers: corsHeaders });
    
  } catch (error) {
    console.error(`[${requestId}] Error in hybrid search:`, error);
    return corsError(req, 'Internal server error', 500);
  }
}
