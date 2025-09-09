import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Simple database connectivity test
export async function GET(req: NextRequest) {
  const requestId = `debug-${Date.now()}`;
  
  console.log(`[${requestId}] === DEBUG DB TEST ===`);
  
  try {
    // Test 1: Simple count query
    const { count: profileCount, error: countError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error(`[${requestId}] Count error:`, countError);
      return corsError(req, `Count failed: ${countError.message}`, 500);
    }

    // Test 2: Simple select with limit
    const { data: profiles, error: selectError } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .limit(5);

    if (selectError) {
      console.error(`[${requestId}] Select error:`, selectError);
      return corsError(req, `Select failed: ${selectError.message}`, 500);
    }

    // Test 3: Test with join
    const { data: profilesWithFunds, error: joinError } = await supabaseAdmin
      .from('ria_profiles')
      .select(`
        crd_number,
        legal_name,
        ria_private_funds(fund_name, fund_type)
      `)
      .limit(3);

    if (joinError) {
      console.error(`[${requestId}] Join error:`, joinError);
      return corsError(req, `Join failed: ${joinError.message}`, 500);
    }

    // All tests passed
    const response = {
      success: true,
      tests: {
        count: { success: true, result: profileCount },
        select: { success: true, count: profiles?.length || 0, sample: profiles?.[0] },
        join: { success: true, count: profilesWithFunds?.length || 0, sample: profilesWithFunds?.[0] }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        supabaseUrl: process.env.SUPABASE_URL ? 'Set' : 'Missing',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing'
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString()
      }
    };

    console.log(`[${requestId}] All database tests passed`);
    
    return NextResponse.json(response, { headers: corsHeaders(req) });
    
  } catch (error) {
    console.error(`[${requestId}] Debug error:`, error);
    return corsError(req, `Debug failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
}
