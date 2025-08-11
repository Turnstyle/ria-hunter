import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
]
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS

function getAllowedOriginFromRequest(req: NextRequest): string | undefined {
  const origin = req.headers.get('origin') || undefined
  if (origin && EFFECTIVE_ALLOWED_ORIGINS.includes(origin)) return origin
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
    const cik = ctx.params.cik
    if (!cik) {
      return corsify(req, NextResponse.json({ error: 'Missing cik', code: 'BAD_REQUEST' }, { status: 400 }))
    }

    // Core profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', cik)
      .single()
    if (profileError || !profile) {
      return corsify(req, NextResponse.json({ error: 'Profile not found', code: 'NOT_FOUND' }, { status: 404 }))
    }

    // Filings and private funds are optional – join tables if available (placeholder queries)
    // These will no-op if tables are absent
    let filings: any[] = []
    let private_funds: any[] = []

    try {
      const filingsRes = await supabaseAdmin
        .from('ria_filings')
        .select('*')
        .eq('crd_number', cik)
        .order('filing_date', { ascending: false })
        .limit(20)
      filings = filingsRes.data || []
    } catch {}

    try {
      const fundsRes = await supabaseAdmin
        .from('ria_private_funds')
        .select('*')
        .eq('crd_number', cik)
        .limit(50)
      private_funds = fundsRes.data || []
    } catch {}

    const result = {
      // canonical core
      cik: String(profile.crd_number),
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
      website: profile.website || undefined,
      filings: filings.map((f: any) => ({
        id: f.id || undefined,
        filing_date: f.filing_date,
        total_aum: f.total_aum,
        manages_private_funds_flag: f.manages_private_funds_flag,
        private_fund_count: f.private_fund_count,
      })),
      private_funds: private_funds.map((pf: any) => ({
        id: pf.id || undefined,
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


