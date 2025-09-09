import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Get detailed RIA profile
export async function GET(
  req: NextRequest,
  { params }: { params: { crd: string } }
) {
  const requestId = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`[${requestId}] === ASK PROFILE REQUEST ===`);
  console.log(`[${requestId}] CRD: ${params.crd}`);
  
  try {
    const crd = params.crd;
    
    // Validate CRD number
    if (!crd || !/^\d+$/.test(crd)) {
      return corsError(req, 'Invalid CRD number', 400);
    }

    // Query for the profile with all related data
    const { data: profile, error } = await supabaseAdmin
      .from('ria_profiles')
      .select(`
        *,
        narratives(narrative),
        control_persons(person_name, title),
        ria_private_funds(
          fund_name,
          fund_type,
          fund_type_other,
          gross_asset_value,
          min_investment,
          is_3c1,
          is_3c7,
          is_master,
          is_feeder,
          master_fund_name,
          master_fund_id,
          is_fund_of_funds,
          invested_self_related,
          invested_securities,
          prime_brokers,
          custodians,
          administrator,
          percent_assets_valued,
          marketing,
          annual_audit,
          gaap,
          fs_distributed,
          unqualified_opinion,
          owners
        )
      `)
      .eq('crd_number', crd)
      .single();

    if (error || !profile) {
      console.error(`[${requestId}] Profile not found:`, error);
      return corsError(req, 'RIA profile not found', 404);
    }

    // Analyze fund data
    const fundAnalysis = {
      totalFunds: profile.ria_private_funds?.length || 0,
      fundTypes: [...new Set((profile.ria_private_funds || []).map((f: any) => f.fund_type).filter(Boolean))],
      totalFundAum: (profile.ria_private_funds || []).reduce((sum: number, f: any) => sum + (f.gross_asset_value || 0), 0),
      vcFunds: (profile.ria_private_funds || []).filter((f: any) => {
        const ft = (f.fund_type || '').toLowerCase();
        return ft.includes('venture') || ft.includes('vc');
      }).length,
      peFunds: (profile.ria_private_funds || []).filter((f: any) => {
        const ft = (f.fund_type || '').toLowerCase();
        return ft.includes('private equity') || ft.includes('pe');
      }).length,
      hedgeFunds: (profile.ria_private_funds || []).filter((f: any) => {
        const ft = (f.fund_type || '').toLowerCase();
        return ft.includes('hedge');
      }).length
    };

    // Build response
    const response = {
      success: true,
      profile: {
        ...profile,
        fund_analysis: fundAnalysis
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString()
      }
    };

    console.log(`[${requestId}] Returning profile for ${profile.legal_name}`);
    
    return NextResponse.json(response, { headers: corsHeaders });
    
  } catch (error) {
    console.error(`[${requestId}] Error fetching profile:`, error);
    return corsError(req, 'Internal server error', 500);
  }
}
