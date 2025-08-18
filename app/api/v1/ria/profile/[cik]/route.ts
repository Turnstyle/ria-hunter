import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
]
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS

function isAllowedPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    const host = url.hostname
    // Allow Vercel preview deployments for this project
    return host.endsWith('.vercel.app') && (host.startsWith('ria-hunter-') || host.startsWith('ria-hunter-app-'))
  } catch {
    return false
  }
}

function getAllowedOriginFromRequest(req: NextRequest): string | undefined {
  const origin = req.headers.get('origin') || undefined
  if (origin && (EFFECTIVE_ALLOWED_ORIGINS.includes(origin) || isAllowedPreviewOrigin(origin))) return origin
  return undefined
}

function corsify(req: NextRequest, res: Response, preflight = false): Response {
  const headers = new Headers(res.headers)
  const origin = getAllowedOriginFromRequest(req) || EFFECTIVE_ALLOWED_ORIGINS[0]
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (preflight) headers.set('Access-Control-Max-Age', '86400')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export function OPTIONS(req: NextRequest) {
  return corsify(req, new Response(null, { status: 204 }), true)
}

export async function GET(req: NextRequest, ctx: { params: { cik: string } }) {
  try {
    const identifier = ctx.params.cik
    if (!identifier) {
      return corsify(req, NextResponse.json({ error: 'Missing identifier', code: 'BAD_REQUEST' }, { status: 400 }))
    }

    // Core profile - Look up by CRD number (primary key)
    let profile = null
    let profileError = null
    
    console.log(`🔍 Looking up profile with identifier: ${identifier} (type: ${typeof identifier})`)
    
    // Try as string first
    const { data: crdProfile, error: crdError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', identifier)
      .single()
    
    console.log(`📊 CRD lookup result (string):`, { 
      found: !!crdProfile, 
      error: crdError?.message, 
      errorCode: crdError?.code,
      identifier: identifier,
      identifierType: typeof identifier
    })
    
    if (crdProfile) {
      profile = crdProfile
    } else {
      profileError = crdError
      console.log(`❌ Profile ${identifier} not found as string, error:`, crdError)
      
      // Try as integer if string failed
      const numericIdentifier = parseInt(identifier, 10)
      if (!isNaN(numericIdentifier) && String(numericIdentifier) === identifier) {
        console.log(`🔄 Retrying with numeric identifier: ${numericIdentifier}`)
        
        const { data: numericProfile, error: numericError } = await supabaseAdmin
          .from('ria_profiles')
          .select('*')
          .eq('crd_number', numericIdentifier)
          .single()
        
        console.log(`📊 CRD lookup result (numeric):`, { 
          found: !!numericProfile, 
          error: numericError?.message,
          errorCode: numericError?.code,
          identifier: numericIdentifier,
          identifierType: typeof numericIdentifier
        })
        
        if (numericProfile) {
          profile = numericProfile
          profileError = null
          console.log(`✅ Found profile with numeric lookup: ${numericProfile.legal_name}`)
        }
      }
    }

    if (profileError || !profile) {
      return corsify(req, NextResponse.json({ error: 'Profile not found', code: 'NOT_FOUND' }, { status: 404 }))
    }

    // Optional related data - use the actual CRD number from the profile
    const crdNumber = profile.crd_number
    let filings: any[] = []
    let private_funds: any[] = []
    let executives: any[] = []

    try {
      const filingsRes = await supabaseAdmin
        .from('ria_filings')
        .select('*')
        .eq('crd_number', crdNumber)
        .order('filing_date', { ascending: false })
        .limit(20)
      filings = filingsRes.data || []
    } catch {}

    try {
      const fundsRes = await supabaseAdmin
        .from('ria_private_funds')
        .select('*')
        .eq('crd_number', crdNumber)
        .limit(50)
      private_funds = fundsRes.data || []
    } catch {}

    // Control persons / executives (if table exists)
    try {
      const execRes = await supabaseAdmin
        .from('control_persons')
        .select('*')
        .eq('crd_number', crdNumber)
        .order('person_name', { ascending: true })
      executives = execRes.data || []
    } catch {}

    const result = {
      // canonical core - return actual CIK if available, otherwise use CRD number
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
      main_addr_city: profile.city,
      main_addr_state: profile.state,
      total_aum: profile.aum,
      phone_number: profile.phone || undefined,
      fax_number: profile.fax || undefined,
      website: profile.website || undefined,
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

    return corsify(req, NextResponse.json(result))
  } catch (error) {
    console.error('profile endpoint error:', error)
    return corsify(req, NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 }))
  }
}


