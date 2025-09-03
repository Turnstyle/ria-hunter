import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors'

// Force Node.js runtime to avoid Edge runtime limitations with Supabase
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// OPTIONS handler for CORS preflight
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = `ria-profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  
  console.log(`[${requestId}] === RIA PROFILE REQUEST ===`)
  console.log(`[${requestId}] Identifier: ${params.id}`)
  console.log(`[${requestId}] URL: ${request.url}`)
  
  try {
    const identifier = params.id
    if (!identifier) {
      console.log(`[${requestId}] Error: Missing identifier`)
      return corsError(request, 'Missing identifier', 400)
    }
    
    // Special debug mode for query endpoint testing
    const url = new URL(request.url)
    const isQueryDebug = url.searchParams.get('query_debug') === '1'
    
    if (isQueryDebug) {
      // Return in query endpoint format for testing
      const result = {
        results: [{
          crd_number: parseInt(identifier),
          legal_name: "QUERY_ENDPOINT_TEST",
          cik: identifier,
          source: 'debug',
          sourceCategory: 'exact_match',
          matchReason: `debug_test_${identifier}`
        }],
        total: 1,
        query: `Debug test ${identifier}`,
        decomposition: { semantic_query: '', structured_filters: {} }
      }
      return NextResponse.json(result, { headers: corsHeaders(request) })
    }

    // Core profile lookup - Try by CIK (text) or CRD number
    let profile = null
    let profileError = null
    
    console.log(`[${requestId}] Looking up profile with identifier: ${identifier}`)
    
    // First try by CIK (text field in database)
    const { data: cikProfile, error: cikError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .eq('cik', identifier)
      .single()

    if (cikProfile) {
      profile = cikProfile
      console.log(`[${requestId}] Found profile by CIK: ${cikProfile.legal_name}`)
    } else if (cikError && cikError.code !== 'PGRST116') {
      // PGRST116 is "no rows found", which is expected
      console.log(`[${requestId}] CIK lookup error:`, cikError.message)
      profileError = cikError
    }

    // If not found by CIK, try CRD as string
    if (!profile) {
      const { data: crdProfile, error: crdError } = await supabaseAdmin
        .from('ria_profiles')
        .select('*')
        .eq('crd_number', identifier)
        .single()
    
      if (crdProfile) {
        profile = crdProfile
        console.log(`[${requestId}] Found profile by CRD (string): ${crdProfile.legal_name}`)
      } else if (crdError && crdError.code !== 'PGRST116') {
        profileError = crdError
        console.log(`[${requestId}] CRD string lookup error:`, crdError.message)
      }
    }

    // If still not found, try CRD as integer
    if (!profile) {
      const numericIdentifier = parseInt(identifier, 10)
      if (!isNaN(numericIdentifier)) {
        console.log(`[${requestId}] Trying numeric CRD: ${numericIdentifier}`)
        const { data: numericProfile, error: numericError } = await supabaseAdmin
          .from('ria_profiles')
          .select('*')
          .eq('crd_number', numericIdentifier)
          .single()
          
        if (numericProfile) {
          profile = numericProfile
          profileError = null
          console.log(`[${requestId}] Found profile by CRD (numeric): ${numericProfile.legal_name}`)
        } else if (numericError && numericError.code !== 'PGRST116') {
          profileError = numericError
          console.log(`[${requestId}] CRD numeric lookup error:`, numericError.message)
        }
      }
    }

    // If still not found, check advisers table as fallback
    if (!profile) {
      console.log(`[${requestId}] Checking advisers table as fallback`)
      const { data: adviserData, error: adviserError } = await supabaseAdmin
        .from('advisers')
        .select('adviser_pk, cik, legal_name, main_addr_street1, main_addr_city, main_addr_state, main_addr_zip, main_addr_country')
        .eq('cik', identifier)
        .single()
      
      if (adviserData) {
        console.log(`[${requestId}] Found in advisers table: ${adviserData.legal_name}`)
        
        // Try to find corresponding record in ria_profiles by legal name
        const { data: profileMatch } = await supabaseAdmin
          .from('ria_profiles')
          .select('*')
          .eq('legal_name', adviserData.legal_name)
          .single()
        
        if (profileMatch) {
          profile = profileMatch
          console.log(`[${requestId}] Found matching RIA profile by legal name`)
        } else {
          // Create a minimal response from advisers data
          console.log(`[${requestId}] Using adviser data for response`)
          return NextResponse.json({
            cik: adviserData.cik,
            crd_number: adviserData.adviser_pk,
            legal_name: adviserData.legal_name,
            main_office_location: {
              street: adviserData.main_addr_street1 || undefined,
              city: adviserData.main_addr_city,
              state: adviserData.main_addr_state,
              zipcode: adviserData.main_addr_zip || undefined,
              country: adviserData.main_addr_country || 'US',
            },
            main_addr_street1: adviserData.main_addr_street1 || null,
            main_addr_street2: null,
            main_addr_city: adviserData.main_addr_city,
            main_addr_state: adviserData.main_addr_state,
            main_addr_zip: adviserData.main_addr_zip || null,
            main_addr_country: adviserData.main_addr_country || 'United States',
            total_aum: null,
            phone_number: null,
            fax_number: null,
            website: null,
            executives: [],
            filings: [],
            private_funds: []
          }, { headers: corsHeaders(request) })
        }
      }
    }

    if (!profile) {
      console.log(`[${requestId}] Profile not found for identifier: ${identifier}`)
      return corsError(request, 'Profile not found', 404)
    }

    // Fetch related data using the CRD number from the profile
    const crdNumber = profile.crd_number
    console.log(`[${requestId}] Fetching related data for CRD: ${crdNumber}`)
    
    let filings: any[] = []
    let private_funds: any[] = []
    let executives: any[] = []

    // Fetch filings
    try {
      const filingsRes = await supabaseAdmin
        .from('ria_filings')
        .select('*')
        .eq('crd_number', crdNumber)
        .order('filing_date', { ascending: false })
        .limit(20)
      filings = filingsRes.data || []
      console.log(`[${requestId}] Found ${filings.length} filings`)
    } catch (error) {
      console.log(`[${requestId}] Error fetching filings:`, error)
    }

    // Fetch private funds
    try {
      const fundsRes = await supabaseAdmin
        .from('ria_private_funds')
        .select('*')
        .eq('crd_number', crdNumber)
        .limit(50)
      private_funds = fundsRes.data || []
      console.log(`[${requestId}] Found ${private_funds.length} private funds`)
    } catch (error) {
      console.log(`[${requestId}] Error fetching private funds:`, error)
    }

    // Fetch control persons / executives
    try {
      const execRes = await supabaseAdmin
        .from('control_persons')
        .select('*')
        .eq('crd_number', crdNumber)
        .order('person_name', { ascending: true })
      executives = execRes.data || []
      console.log(`[${requestId}] Found ${executives.length} executives`)
    } catch (error) {
      console.log(`[${requestId}] Error fetching executives:`, error)
    }

    // Build response object
    const result = {
      // Core profile data
      cik: profile.cik || String(profile.crd_number),
      crd_number: profile.crd_number,
      legal_name: profile.legal_name,
      main_office_location: {
        street: profile.address || undefined,
        city: profile.city,
        state: profile.state,
        zipcode: profile.zip_code || undefined,
        country: 'US',
      },
      // Explicit main_addr_* fields for frontend convenience
      main_addr_street1: profile.address || null,
      main_addr_street2: null,
      main_addr_city: profile.city,
      main_addr_state: profile.state,
      main_addr_zip: profile.zip_code || null,
      main_addr_country: 'United States',
      total_aum: profile.aum,
      phone_number: profile.phone || null,
      fax_number: profile.fax || null,
      website: profile.website || null,
      // Related data
      executives: executives.map((p: any) => ({
        name: p.person_name,
        title: p.title || undefined,
      })),
      filings: filings.map((f: any) => ({
        id: f.id || undefined,
        filing_id: f.id || undefined,
        filing_date: f.filing_date,
        total_aum: f.total_aum,
        manages_private_funds_flag: f.manages_private_funds_flag,
        report_period_end_date: f.report_period_end_date || null,
        private_fund_count: f.private_fund_count,
      })),
      private_funds: private_funds.map((pf: any) => ({
        id: pf.id || undefined,
        fund_id: pf.id || undefined,
        fund_name: pf.fund_name,
        fund_type: pf.fund_type,
        gross_asset_value: pf.gross_asset_value,
        min_investment: pf.min_investment,
      })),
    }

    console.log(`[${requestId}] === REQUEST COMPLETE ===`)
    return NextResponse.json(result, { headers: corsHeaders(request) })
    
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error)
    return corsError(request, 'Internal server error', 500)
  }
}