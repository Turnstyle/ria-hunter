import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Browse RIAs by location and filters - no search query needed
export async function GET(req: NextRequest) {
  const requestId = `browse-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === ASK BROWSE REQUEST ===`);
  
  try {
    const searchParams = req.nextUrl.searchParams;
    
    // Extract parameters
    const state = searchParams.get('state');
    const city = searchParams.get('city');
    const fundType = searchParams.get('fundType');
    const hasVcActivity = searchParams.get('hasVcActivity') === 'true';
    const minAum = searchParams.get('minAum') ? parseInt(searchParams.get('minAum')) : undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sortBy = searchParams.get('sortBy') || 'aum'; // 'aum', 'name', 'fund_count'
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    console.log(`[${requestId}] Filters:`, { state, city, fundType, hasVcActivity, minAum, limit, offset });

    // Build the base query
    let query = supabaseAdmin
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
        ria_private_funds(
          fund_name,
          fund_type,
          gross_asset_value
        )
      `, { count: 'exact' });

    // Apply filters
    if (state) {
      query = query.eq('state', state.toUpperCase());
    }

    if (city) {
      // Trust semantic search to understand location variations naturally
      query = query.ilike('city', `%${city}%`);
    }

    if (minAum) {
      query = query.gte('aum', minAum);
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    switch (sortBy) {
      case 'name':
        query = query.order('legal_name', { ascending });
        break;
      case 'fund_count':
        query = query.order('private_fund_count', { ascending, nullsFirst: false });
        break;
      case 'aum':
      default:
        query = query.order('aum', { ascending, nullsFirst: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: riaProfiles, error, count } = await query;

    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return corsError(req, 'Database query failed', 500);
    }

    // Filter by fund type if specified (post-query filtering)
    let filteredResults = riaProfiles || [];
    
    if (fundType) {
      const fundTypeLower = fundType.toLowerCase();
      
      filteredResults = filteredResults.filter(ria => {
        if (!ria.ria_private_funds || ria.ria_private_funds.length === 0) {
          return false;
        }
        
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

    // Filter by VC activity if specified
    if (hasVcActivity) {
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
    }

    // Format results with fund analysis
    const formattedResults = filteredResults.map(ria => {
      // Analyze fund types
      const fundTypes = new Set<string>();
      const fundsByType: Record<string, number> = {};
      let totalFundAum = 0;

      (ria.ria_private_funds || []).forEach((fund: any) => {
        if (fund.fund_type) {
          fundTypes.add(fund.fund_type);
          fundsByType[fund.fund_type] = (fundsByType[fund.fund_type] || 0) + 1;
        }
        if (fund.gross_asset_value) {
          totalFundAum += fund.gross_asset_value;
        }
      });

      // Check for VC/PE activity
      const hasVcActivity = (ria.ria_private_funds || []).some((fund: any) => {
        const ft = (fund.fund_type || '').toLowerCase();
        return ft.includes('venture') || ft.includes('vc') || 
               ft.includes('private equity') || ft.includes('pe');
      });

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
        funds: ria.ria_private_funds || [],
        fund_types: Array.from(fundTypes),
        funds_by_type: fundsByType,
        has_vc_activity: hasVcActivity
      };
    });

    // Build response
    const response = {
      success: true,
      filters: {
        state,
        city,
        fundType,
        hasVcActivity,
        minAum
      },
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (count || 0) > offset + limit
      },
      sorting: {
        sortBy,
        sortOrder
      },
      results: formattedResults,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        totalResults: formattedResults.length
      }
    };

    console.log(`[${requestId}] Returning ${formattedResults.length} results`);
    
    return NextResponse.json(response, { headers: corsHeaders });
    
  } catch (error) {
    console.error(`[${requestId}] Error in browse:`, error);
    return corsError(req, 'Internal server error', 500);
  }
}
