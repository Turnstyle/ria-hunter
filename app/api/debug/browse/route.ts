import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Simplified browse test - step by step debugging
export async function GET(req: NextRequest) {
  const requestId = `debug-browse-${Date.now()}`;
  
  console.log(`[${requestId}] === DEBUG BROWSE TEST ===`);
  
  try {
    const searchParams = req.nextUrl.searchParams;
    const state = searchParams.get('state') || 'MO';
    const city = searchParams.get('city') || 'St. Louis';
    
    console.log(`[${requestId}] Testing with state=${state}, city=${city}`);
    
    // Test 1: Simple query with basic fields
    const { data: test1, error: error1 } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('state', state.toUpperCase())
      .limit(5);

    if (error1) {
      return corsError(req, `Test 1 failed: ${error1.message}`, 500);
    }

    // Test 2: Add city filter
    const { data: test2, error: error2 } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('state', state.toUpperCase())
      .ilike('city', `%${city}%`)
      .limit(5);

    if (error2) {
      return corsError(req, `Test 2 failed: ${error2.message}`, 500);
    }

    // Test 3: Add basic fund join
    const { data: test3, error: error3 } = await supabaseAdmin
      .from('ria_profiles')
      .select(`
        crd_number,
        legal_name,
        city,
        state,
        ria_private_funds(fund_name, fund_type)
      `)
      .eq('state', state.toUpperCase())
      .ilike('city', `%${city}%`)
      .limit(3);

    if (error3) {
      return corsError(req, `Test 3 failed: ${error3.message}`, 500);
    }

    // Test 4: Full browse query structure
    const { data: test4, error: error4 } = await supabaseAdmin
      .from('ria_profiles')
      .select(`
        crd_number,
        legal_name,
        city,
        state,
        aum,
        private_fund_count,
        private_fund_aum,
        business_zip,
        business_phone,
        business_email,
        website,
        employee_count,
        total_accounts,
        discretionary_aum,
        ria_private_funds(
          fund_name,
          fund_type,
          gross_asset_value
        )
      `)
      .eq('state', state.toUpperCase())
      .ilike('city', `%${city}%`)
      .limit(2);

    if (error4) {
      return corsError(req, `Test 4 failed: ${error4.message}`, 500);
    }

    const response = {
      success: true,
      tests: {
        test1: { success: true, count: test1?.length || 0, sample: test1?.[0] },
        test2: { success: true, count: test2?.length || 0, sample: test2?.[0] },
        test3: { success: true, count: test3?.length || 0, sample: test3?.[0] },
        test4: { success: true, count: test4?.length || 0, sample: test4?.[0] }
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        parameters: { state, city }
      }
    };

    console.log(`[${requestId}] All browse tests passed`);
    
    return NextResponse.json(response, { headers: corsHeaders(req) });
    
  } catch (error) {
    console.error(`[${requestId}] Debug browse error:`, error);
    return corsError(req, `Debug browse failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
}
