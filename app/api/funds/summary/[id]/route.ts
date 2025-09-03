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

function mapFundTypeToShort(input: string): string {
  const t = input.toLowerCase()
  if (t.includes('venture')) return 'VC'
  if (t.includes('private equity')) return 'PE'
  if (t.includes('hedge')) return 'HF'
  if (t.includes('real estate') && !t.includes('reit')) return 'RE'
  if (t.includes('reit')) return 'REIT'
  if (t.includes('fund of funds')) return 'FoF'
  if (t.includes('credit') || t.includes('debt') || t.includes('fixed income')) return 'Credit'
  if (t.includes('commodity')) return 'Commodity'
  if (t.includes('bdc')) return 'BDC'
  if (t.includes('closed-end') || t.includes('closed end')) return 'CEF'
  if (t.includes('open-end') || t.includes('open end') || t.includes('mutual fund')) return 'OEF'
  if (t.includes('mlp')) return 'MLP'
  if (t.includes('infrastructure')) return 'Infra'
  if (t.includes('energy')) return 'Energy'
  return 'Other'
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = `funds-summary-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  
  console.log(`[${requestId}] === FUNDS SUMMARY REQUEST ===`)
  console.log(`[${requestId}] Identifier: ${params.id}`)
  console.log(`[${requestId}] URL: ${request.url}`)
  
  try {
    const identifier = params.id
    if (!identifier) {
      console.log(`[${requestId}] Error: Missing identifier`)
      return corsError(request, 'Missing identifier', 400)
    }

    // Resolve CRD by CIK if needed
    let crd = identifier
    
    // Check if identifier is not a number (likely a CIK)
    if (isNaN(Number(identifier))) {
      console.log(`[${requestId}] Identifier appears to be CIK, looking up CRD`)
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number')
        .eq('cik', identifier)
        .single()
      
      if (profile?.crd_number) {
        crd = String(profile.crd_number)
        console.log(`[${requestId}] Found CRD: ${crd} for CIK: ${identifier}`)
      } else if (profileError) {
        console.log(`[${requestId}] Could not resolve CRD for CIK: ${identifier}`)
      }
    }

    // Query fund counts grouped by type
    console.log(`[${requestId}] Querying private funds for CRD: ${crd}`)
    const { data, error } = await supabaseAdmin
      .from('ria_private_funds')
      .select('fund_type')
      .eq('crd_number', crd)

    if (error) {
      console.error(`[${requestId}] Fund summary query error:`, error)
      // Return empty summary instead of 500 to avoid breaking UI
      return NextResponse.json(
        { crd_number: crd, summary: [] },
        { headers: corsHeaders(request) }
      )
    }

    // Group and count by fund type
    const counts: Record<string, number> = {}
    for (const row of data || []) {
      const key = row.fund_type && String(row.fund_type).trim().length > 0 
        ? String(row.fund_type) 
        : 'Unknown'
      counts[key] = (counts[key] || 0) + 1
    }

    // Convert to summary array and sort by count
    const summary = Object.entries(counts)
      .map(([type, count]) => ({
        type,
        type_short: type === 'Unknown' ? 'Other' : mapFundTypeToShort(type),
        count
      }))
      .sort((a, b) => b.count - a.count)

    console.log(`[${requestId}] Found ${data?.length || 0} funds in ${Object.keys(counts).length} categories`)
    console.log(`[${requestId}] === REQUEST COMPLETE ===`)

    return NextResponse.json(
      { crd_number: crd, summary },
      { headers: corsHeaders(request) }
    )
    
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error)
    // Soft-fail with empty summary
    return NextResponse.json(
      { crd_number: params.id, summary: [] },
      { headers: corsHeaders(request) }
    )
  }
}