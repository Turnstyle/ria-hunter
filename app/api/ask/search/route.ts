import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Main search endpoint - combining text and semantic search
export async function POST(req: NextRequest) {
  const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === ASK SEARCH REQUEST ===`);
  
  try {
    const body = await req.json();
    const { 
      query = '',
      filters = {},
      limit = 500,
      searchType = 'text' // 'text', 'semantic', or 'hybrid' - for now just text
    } = body;

    // Extract filters
    const { state, city, fundType, minAum, hasVcActivity } = filters;

    console.log(`[${requestId}] Query: "${query}"`);
    console.log(`[${requestId}] Filters:`, filters);

    // Build the base query - using same logic as browse endpoint which works correctly
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
        narratives(narrative),
        control_persons(person_name, title),
        ria_private_funds(
          fund_name,
          fund_type,
          gross_asset_value
        )
      `);

    // Apply geographic filters - same logic as browse
    if (state) {
      dbQuery = dbQuery.eq('state', state.toUpperCase());
    }

    if (city) {
      // Handle St. Louis and other city variations - same logic as browse
      if (city.toLowerCase().includes('st') && city.toLowerCase().includes('louis')) {
        dbQuery = dbQuery.or('city.ilike.%ST LOUIS%,city.ilike.%ST. LOUIS%');
      } else {
        dbQuery = dbQuery.ilike('city', `%${city}%`);
      }
    }

    if (minAum) {
      dbQuery = dbQuery.gte('aum', minAum);
    }

    // PERFORMANCE OPTIMIZATION: Skip text search for superlative + location queries
    // Detect queries that are asking for "largest", "biggest", "top N" with location filters
    const isSuperlaticeLocationQuery = query && (state || city) && 
      /\b(largest|biggest|top\s+\d+|most|best|greatest)\b/i.test(query);
    
    // Text search on query if provided, but skip if we're doing filtered searches
    // When filters are applied, the query is more of a description than a literal search term
    const hasFilters = state || city || fundType || hasVcActivity || minAum;
    
    // Skip text search for superlative queries with location filters (performance optimization)
    if (query && !hasFilters && !isSuperlaticeLocationQuery) {
      // Check if query is a CRD number
      const isNumber = /^\d+$/.test(query);
      if (isNumber) {
        dbQuery = dbQuery.or(`legal_name.ilike.%${query}%,crd_number.eq.${query}`);
      } else {
        // Search in legal name and optionally in narratives
        dbQuery = dbQuery.ilike('legal_name', `%${query}%`);
      }
    } else if (query && hasFilters) {
      // When we have filters, treat query as descriptive - don't search literal text
      console.log(`[${requestId}] Skipping text search due to filters - query is descriptive: "${query}"`);
    }

    // Apply sorting
    dbQuery = dbQuery.order('aum', { ascending: false, nullsFirst: false });

    // Execute the query - get a large limit to handle post-filtering
    // We need high limit because VC filtering happens after the main query
    dbQuery = dbQuery.limit(5000); // Much higher to ensure we get enough results for filtering
    
    const { data: riaProfiles, error } = await dbQuery;

    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return corsError(req, 'Database query failed', 500);
    }

    // Post-process for VC activity and fund type filters
    let filteredResults = riaProfiles || [];
    
    // Filter by fund type if specified
    if (fundType) {
      filteredResults = filteredResults.filter(ria => {
        if (!ria.ria_private_funds || ria.ria_private_funds.length === 0) {
          return false;
        }
        
        const fundTypeLower = fundType.toLowerCase();
        return ria.ria_private_funds.some((fund: any) => {
          const fundTypeStr = (fund.fund_type || '').toLowerCase();
          
          // Check for VC/PE variations
          if (fundTypeLower.includes('venture') || fundTypeLower === 'vc') {
            return fundTypeStr.includes('venture') || fundTypeStr.includes('vc');
          }
          if (fundTypeLower.includes('private equity') || fundTypeLower === 'pe') {
            return fundTypeStr.includes('private equity') || fundTypeStr.includes('pe');
          }
          if (fundTypeLower.includes('hedge')) {
            return fundTypeStr.includes('hedge');
          }
          
          // Direct match for other fund types
          return fundTypeStr.includes(fundTypeLower);
        });
      });
    }

    console.log(`[${requestId}] Before VC filtering: ${filteredResults.length} results`);
    
    // Filter by VC activity if specified - using exact same logic as browse endpoint
    if (hasVcActivity) {
      console.log(`[${requestId}] Applying hasVcActivity filter...`);
      
      const initialCount = filteredResults.length;
      filteredResults = filteredResults.filter(ria => {
        if (!ria.ria_private_funds || ria.ria_private_funds.length === 0) {
          return false;
        }
        return ria.ria_private_funds.some((fund: any) => {
          const fundType = (fund.fund_type || '').toLowerCase();
          return fundType.includes('venture') || 
                 fundType.includes('vc') || 
                 fundType.includes('private equity') || 
                 fundType.includes('pe');
        });
      });
      
      const filteredCount = filteredResults.length;
      console.log(`[${requestId}] VC filtering complete: ${initialCount} → ${filteredCount} results (${Math.round((filteredCount/initialCount)*100)}% match rate)`);
    }

    // Format results
    const formattedResults = filteredResults.slice(0, limit).map(ria => {
      // Calculate VC metrics
      const vcFunds = (ria.ria_private_funds || []).filter((fund: any) => {
        const fundType = (fund.fund_type || '').toLowerCase();
        return fundType.includes('venture') || fundType.includes('vc');
      });
      
      const peFunds = (ria.ria_private_funds || []).filter((fund: any) => {
        const fundType = (fund.fund_type || '').toLowerCase();
        return fundType.includes('private equity') || fundType.includes('pe');
      });

      return {
        crd_number: ria.crd_number,
        legal_name: ria.legal_name,
        city: ria.city,
        state: ria.state,
        aum: ria.aum || 0,
        private_fund_count: ria.private_fund_count || 0,
        private_fund_aum: ria.private_fund_aum || 0,
        website: ria.website,
        phone: ria.phone,
        narrative: ria.narratives?.[0]?.narrative || '',
        executives: ria.control_persons || [],
        funds: ria.ria_private_funds || [],
        vc_fund_count: vcFunds.length,
        pe_fund_count: peFunds.length,
        vc_activity: vcFunds.length > 0 || peFunds.length > 0,
        fund_types: [...new Set((ria.ria_private_funds || []).map((f: any) => f.fund_type).filter(Boolean))]
      };
    });

    // Build response
    const response = {
      success: true,
      query,
      filters,
      searchType,
      totalResults: formattedResults.length,
      results: formattedResults,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        totalQueried: riaProfiles?.length || 0,
        filteredCount: filteredResults.length,
        returnedCount: formattedResults.length
      }
    };

    console.log(`[${requestId}] Returning ${formattedResults.length} results`);
    
    return NextResponse.json(response, { headers: corsHeaders });
    
  } catch (error) {
    console.error(`[${requestId}] Error in search:`, error);
    return corsError(req, 'Internal server error', 500);
  }
}

// GET endpoint for simple searches
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  
  // Convert GET params to POST body format
  const body = {
    query: searchParams.get('query') || '',
    filters: {
      state: searchParams.get('state'),
      city: searchParams.get('city'),
      fundType: searchParams.get('fundType'),
      minAum: searchParams.get('minAum') ? parseInt(searchParams.get('minAum')!) : undefined,
      hasVcActivity: searchParams.get('hasVcActivity') === 'true'
    },
    limit: parseInt(searchParams.get('limit') || '500'),
    searchType: searchParams.get('searchType') || 'text'
  };

  // Create a mock POST request with the body
  const mockRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body)
  });

  return POST(mockRequest);
}
