import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// CORS configuration
const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
  'http://localhost:3000',
]

function corsify(req: NextRequest, res: Response): Response {
  const headers = new Headers(res.headers)
  const origin = req.headers.get('origin')
  if (origin && DEFAULT_ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  } else {
    headers.set('Access-Control-Allow-Origin', DEFAULT_ALLOWED_ORIGINS[0])
  }
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function OPTIONS(req: NextRequest) {
  return corsify(req, new Response(null, { status: 204 }))
}

// Simple text-based search that works without embeddings
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get('query') || ''
    const state = searchParams.get('state') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    // Build query - use correct column names
    let dbQuery = supabaseAdmin
      .from('ria_profiles')
      .select(`
        *,
        narratives(narrative),
        control_persons(person_name, title),
        ria_private_funds(fund_name, fund_type, gross_asset_value)
      `)

    // Text search on legal_name if query provided
    if (query) {
      // Check if query is a number for CRD search, otherwise just search legal_name
      const isNumber = /^\d+$/.test(query);
      if (isNumber) {
        dbQuery = dbQuery.or(`legal_name.ilike.%${query}%,crd_number.eq.${query}`)
      } else {
        dbQuery = dbQuery.ilike('legal_name', `%${query}%`)
      }
    }

    // State filter
    if (state) {
      dbQuery = dbQuery.eq('state', state.toUpperCase())
    }

    // Order by AUM desc and limit
    dbQuery = dbQuery.order('aum', { ascending: false }).limit(limit)

    const { data, error } = await dbQuery

    if (error) {
      console.error('Search error:', error)
      return corsify(req, NextResponse.json({ 
        error: 'Search failed', 
        details: error.message 
      }, { status: 500 }))
    }

    // Format response
    const results = (data || []).map(profile => ({
      id: profile.crd_number, // Use CRD number as ID
      name: profile.legal_name,
      crd_number: profile.crd_number,
      city: profile.city,
      state: profile.state,
      aum: profile.aum,
      employee_count: null, // Not in current schema
      services: null, // Not in current schema  
      client_types: null, // Not in current schema
      narrative: profile.narratives?.[0]?.narrative || '',
      executives: profile.control_persons?.map((cp: any) => ({
        name: cp.person_name,
        position: cp.title
      })) || [],
      funds: profile.ria_private_funds?.map((fund: any) => ({
        name: fund.fund_name,
        type: fund.fund_type,
        aum: fund.gross_asset_value
      })) || []
    }))

    return corsify(req, NextResponse.json({
      query,
      results,
      total: results.length,
      message: 'Simple text search (no embeddings required)'
    }))

  } catch (error) {
    console.error('API error:', error)
    return corsify(req, NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 }))
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query, filters = {} } = body

    let dbQuery = supabaseAdmin
      .from('ria_profiles')
      .select(`
        *,
        narratives(narrative),
        control_persons(person_name, title),
        ria_private_funds(fund_name, fund_type, gross_asset_value)
      `)

    // Text search - use correct column names
    if (query) {
      const isNumber = /^\d+$/.test(query);
      if (isNumber) {
        dbQuery = dbQuery.or(`legal_name.ilike.%${query}%,crd_number.eq.${query}`)
      } else {
        dbQuery = dbQuery.ilike('legal_name', `%${query}%`)
      }
    }

    // Apply filters
    if (filters.state) {
      dbQuery = dbQuery.eq('state', filters.state.toUpperCase())
    }
    if (filters.min_aum) {
      dbQuery = dbQuery.gte('aum', filters.min_aum)
    }
    if (filters.city) {
      dbQuery = dbQuery.ilike('city', `%${filters.city}%`)
    }

    // Check for VC activity (has private funds)
    if (filters.has_vc_activity) {
      const { data: vcProfiles } = await supabaseAdmin
        .from('ria_private_funds')
        .select('ria_id')
        .in('fund_type', ['Venture Capital', 'Private Equity'])
      
      if (vcProfiles?.length) {
        const vcRiaIds = vcProfiles.map(p => p.ria_id)
        dbQuery = dbQuery.in('id', vcRiaIds)
      }
    }

    dbQuery = dbQuery.order('aum', { ascending: false }).limit(20)

    const { data, error } = await dbQuery

    if (error) {
      return corsify(req, NextResponse.json({ 
        error: 'Search failed', 
        details: error.message 
      }, { status: 500 }))
    }

    const results = (data || []).map(profile => ({
      id: profile.crd_number, // Use CRD number as ID
      name: profile.legal_name,
      crd_number: profile.crd_number,
      city: profile.city,
      state: profile.state,
      aum: profile.aum,
      employee_count: null, // Not in current schema
      narrative: profile.narratives?.[0]?.narrative || '',
      executives: profile.control_persons || [],
      funds: profile.ria_private_funds || [],
      vc_activity: (profile.ria_private_funds || []).some((f: any) => 
        ['Venture Capital', 'Private Equity'].includes(f.fund_type)
      )
    }))

    return corsify(req, NextResponse.json({
      query,
      filters,
      results,
      total: results.length,
      message: 'Advanced search (no embeddings required)'
    }))

  } catch (error) {
    console.error('POST API error:', error)
    return corsify(req, NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 }))
  }
}
