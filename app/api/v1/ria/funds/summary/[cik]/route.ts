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

function isAllowedPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    const host = url.hostname
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
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (preflight) headers.set('Access-Control-Max-Age', '86400')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
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

export function OPTIONS(req: NextRequest) {
  return corsify(req, new Response(null, { status: 204 }), true)
}

export async function GET(req: NextRequest, ctx: { params: { cik: string } }) {
  try {
    const cik = ctx.params.cik
    if (!cik) {
      return corsify(req, NextResponse.json({ error: 'Missing cik', code: 'BAD_REQUEST' }, { status: 400 }))
    }

    // Group counts by fund_type; include "Unknown" bucket for nulls
    const { data, error } = await supabaseAdmin
      .from('ria_private_funds')
      .select('fund_type, count:count()')
      .eq('crd_number', cik)
      .group('fund_type')

    if (error) {
      console.error('fund summary query error:', error)
      return corsify(req, NextResponse.json({ error: 'Query failed', code: 'INTERNAL_ERROR' }, { status: 500 }))
    }

    // Normalize: collapse null/empty to "Unknown", and sort desc by count
    const counts: Record<string, number> = {}
    for (const row of data || []) {
      const key = (row as any).fund_type && String((row as any).fund_type).trim().length > 0 ? String((row as any).fund_type) : 'Unknown'
      const n = Number((row as any).count) || 0
      counts[key] = (counts[key] || 0) + n
    }
    const summary = Object.entries(counts)
      .map(([type, n]) => ({ type, type_short: type === 'Unknown' ? 'Other' : mapFundTypeToShort(type), count: n }))
      .sort((a, b) => b.count - a.count)

    return corsify(req, NextResponse.json({ crd_number: cik, summary }))
  } catch (e) {
    console.error('funds summary endpoint error:', e)
    return corsify(req, NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 }))
  }
}


