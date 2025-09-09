import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

/**
 * Comprehensive search endpoint that returns ALL matching RIAs
 * Combines direct database queries with optional semantic search
 */
export async function POST(req: NextRequest) {
  const requestId = `comprehensive-search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === COMPREHENSIVE SEARCH REQUEST ===`);
  
  try {
    const body = await req.json();
    const { 
      query = '',
      filters = {},
      limit = 1000, // Much higher default limit
      useSemanticFallback = false // Only use semantic search if explicitly requested
    } = body;

    // Extract filters
    const { state, city, fundType, minAum, hasVcActivity } = filters;

    console.log(`[${requestId}] Query: "${query}"`);
    console.log(`[${requestId}] Filters:`, filters);

    // Parse the query to extract location and fund type information
    const queryLower = query.toLowerCase();
    let extractedState = state;
    let extractedCity = city;
    let extractedFundType = fundType;

    // Extract St. Louis from query if not in filters
    if (!extractedCity && (queryLower.includes('st louis') || queryLower.includes('st. louis'))) {
      extractedCity = 'St. Louis';
    }

    // Extract Missouri/MO from query if not in filters
    if (!extractedState && (queryLower.includes('missouri') || queryLower.includes(' mo '))) {
      extractedState = 'MO';
    }

    // Extract fund type from query if not in filters
    if (!extractedFundType) {
      if (queryLower.includes('vc') || queryLower.includes('venture')) {
        extractedFundType = 'Venture Capital';
      } else if (queryLower.includes('pe') || queryLower.includes('private equity')) {
        extractedFundType = 'Private Equity';
      }
    }

    // Build comprehensive database query
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
        narratives(narrative),
        control_persons(person_name, title),
        ria_private_funds(
          fund_name,
          fund_type,
          gross_asset_value
        )
      `, { count: 'exact' });

    // Apply geographic filters
    if (extractedState || state) {
      const stateFilter = (extractedState || state).toUpperCase();
      dbQuery = dbQuery.eq('state', stateFilter);
      console.log(`[${requestId}] Filtering by state: ${stateFilter}`);
    }

    if (extractedCity || city) {
      const cityFilter = extractedCity || city;
      // Handle St. Louis variations
      if (cityFilter.toLowerCase().includes('st') && cityFilter.toLowerCase().includes('louis')) {
        dbQuery = dbQuery.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%');
        console.log(`[${requestId}] Filtering by St. Louis variations`);
      } else {
        dbQuery = dbQuery.ilike('city', `%${cityFilter}%`);
        console.log(`[${requestId}] Filtering by city: ${cityFilter}`);
      }
    }

    // Apply AUM filter
    if (minAum) {
      dbQuery = dbQuery.gte('aum', minAum);
      console.log(`[${requestId}] Filtering by min AUM: ${minAum}`);
    }

    // Apply limit
    dbQuery = dbQuery.limit(limit);

    // Execute the comprehensive query
    const { data: riaProfiles, error, count } = await dbQuery;

    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return corsError(req, 'Database query failed', 500);
    }

    console.log(`[${requestId}] Retrieved ${riaProfiles?.length || 0} RIAs from database`);

    // Post-process to filter by fund type and VC activity
    let filteredResults = riaProfiles || [];
    
    // Filter by fund type if specified
    if (extractedFundType || fundType || hasVcActivity) {
      const targetFundType = extractedFundType || fundType;
      
      filteredResults = filteredResults.filter(ria => {
        if (!ria.ria_private_funds || ria.ria_private_funds.length === 0) {
          return false;
        }
        
        // Check for VC/PE activity
        const hasVcPeActivity = ria.ria_private_funds.some((fund: any) => {
          const fundTypeStr = (fund.fund_type || '').toLowerCase();
          return fundTypeStr.includes('venture') || 
                 fundTypeStr.includes('vc') || 
                 fundTypeStr.includes('private equity') || 
                 fundTypeStr.includes('pe') ||
                 fundTypeStr.includes('buyout') ||
                 fundTypeStr.includes('growth');
        });

        // If just checking for VC activity
        if (hasVcActivity && !targetFundType) {
          return hasVcPeActivity;
        }

        // If checking for specific fund type
        if (targetFundType) {
          const fundTypeLower = targetFundType.toLowerCase();
          
          return ria.ria_private_funds.some((fund: any) => {
            const fundTypeStr = (fund.fund_type || '').toLowerCase();
            
            // Check for VC variations
            if (fundTypeLower.includes('venture') || fundTypeLower === 'vc') {
              return fundTypeStr.includes('venture') || 
                     fundTypeStr.includes('vc') ||
                     fundTypeStr.includes('seed') ||
                     fundTypeStr.includes('early stage');
            }
            
            // Check for PE variations
            if (fundTypeLower.includes('private equity') || fundTypeLower === 'pe') {
              return fundTypeStr.includes('private equity') || 
                     fundTypeStr.includes('pe') ||
                     fundTypeStr.includes('buyout') ||
                     fundTypeStr.includes('growth') ||
                     fundTypeStr.includes('lbo');
            }
            
            // Check for hedge fund variations
            if (fundTypeLower.includes('hedge')) {
              return fundTypeStr.includes('hedge');
            }
            
            // Direct match for other fund types
            return fundTypeStr.includes(fundTypeLower);
          });
        }

        return hasVcPeActivity;
      });

      console.log(`[${requestId}] After fund type filtering: ${filteredResults.length} RIAs`);
    }

    // Format and enrich results
    const formattedResults = filteredResults.map(ria => {
      // Analyze fund types and calculate statistics
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

      // Get executives list
      const executives = (ria.control_persons || []).map((person: any) => ({
        name: person.person_name,
        title: person.title
      }));

      // Determine if this RIA has significant VC/PE activity
      const hasSignificantVcActivity = vcFundCount > 0 || peFundCount > 0;

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
        fax: ria.fax,
        cik: ria.cik,
        narrative: ria.narratives?.[0]?.narrative,
        executives,
        funds: (ria.ria_private_funds || []).map((fund: any) => ({
          name: fund.fund_name,
          type: fund.fund_type,
          aum: fund.gross_asset_value
        })),
        fund_types: Array.from(fundTypes),
        funds_by_type: fundsByType,
        vc_fund_count: vcFundCount,
        pe_fund_count: peFundCount,
        has_vc_activity: hasSignificantVcActivity,
        relevance_score: hasSignificantVcActivity ? 1.0 : 0.5 // Boost relevance for VC/PE firms
      };
    });

    // Sort results by relevance and AUM
    formattedResults.sort((a, b) => {
      // First sort by relevance (VC/PE activity)
      if (a.relevance_score !== b.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      // Then by AUM
      return b.aum - a.aum;
    });

    // Prepare summary statistics
    const summary = {
      total_results: formattedResults.length,
      total_vc_pe_firms: formattedResults.filter(r => r.has_vc_activity).length,
      total_vc_funds: formattedResults.reduce((sum, r) => sum + r.vc_fund_count, 0),
      total_pe_funds: formattedResults.reduce((sum, r) => sum + r.pe_fund_count, 0),
      total_aum: formattedResults.reduce((sum, r) => sum + r.aum, 0),
      total_private_fund_aum: formattedResults.reduce((sum, r) => sum + r.private_fund_aum, 0),
      top_firms_by_aum: formattedResults
        .filter(r => r.has_vc_activity)
        .slice(0, 10)
        .map(r => ({
          name: r.legal_name,
          aum: r.aum,
          vc_funds: r.vc_fund_count,
          pe_funds: r.pe_fund_count
        }))
    };

    // Build comprehensive response
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
      results: formattedResults,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        totalQueried: count || 0,
        returnedCount: formattedResults.length,
        searchStrategy: 'comprehensive-database-query',
        note: 'This search returns ALL matching RIAs from the database without semantic filtering'
      }
    };

    console.log(`[${requestId}] === SEARCH COMPLETE ===`);
    console.log(`[${requestId}] Total Results: ${formattedResults.length}`);
    console.log(`[${requestId}] VC/PE Firms: ${summary.total_vc_pe_firms}`);
    console.log(`[${requestId}] Total AUM: $${(summary.total_aum / 1e9).toFixed(2)}B`);
    
    return NextResponse.json(response, { headers: corsHeaders });
    
  } catch (error) {
    console.error(`[${requestId}] Error in comprehensive search:`, error);
    return corsError(req, 'Internal server error', 500);
  }
}
