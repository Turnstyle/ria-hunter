import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAIService, getAIProvider, type AIProvider } from '@/lib/ai-providers'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
]
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS

type StructuredFilters = {
  location?: string | null
  min_aum?: number | null
  max_aum?: number | null
  services?: string[] | null
}

type QueryDecomposition = {
  semantic_query: string
  structured_filters: StructuredFilters
}

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

async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }>
{
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  try {
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()

    const isSubscriber = !!(subscription && ['trialing', 'active'].includes(subscription.status))
    if (isSubscriber) return { allowed: true, remaining: -1, isSubscriber: true }

    const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
      supabaseAdmin
        .from('user_queries')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString()),
      supabaseAdmin
        .from('user_shares')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('shared_at', startOfMonth.toISOString()),
    ])

    const allowedQueries = 2 + Math.min(shareCount || 0, 1)
    const currentQueries = queryCount || 0
    const remaining = Math.max(0, allowedQueries - currentQueries)
    return { allowed: currentQueries < allowedQueries, remaining, isSubscriber: false }
  } catch (error) {
    console.error('Error checking query limit:', error)
    return { allowed: true, remaining: 0, isSubscriber: false }
  }
}

async function logQueryUsage(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('user_queries').insert({ user_id: userId })
  } catch (error) {
    console.error('Error logging query usage:', error)
  }
}

function parseLocation(location?: string | null): { city?: string; state?: string } {
  if (!location) return {}
  const parts = location.split(',').map((p) => p.trim())
  if (parts.length === 2) {
    const [city, state] = parts
    return { city, state: normalizeState(state) }
  }
  // Fallback: if only state abbreviation
  if (location.length === 2) return { state: location.toUpperCase() }
  return { city: location }
}

function normalizeState(input: string | undefined): string | undefined {
  if (!input) return undefined
  const s = input.trim()
  if (s.length === 2) return s.toUpperCase()
  const map: Record<string, string> = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
    Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
    Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
    Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
    Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
    Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
    Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
    'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY'
  }
  return map[s] || s
}

async function callLLMToDecomposeQuery(userQuery: string, provider?: AIProvider): Promise<QueryDecomposition> {
  let selectedProvider = getAIProvider(provider)
  let aiService = createAIService({ provider: selectedProvider })
  if (!aiService) {
    // Fallback from Vertex to OpenAI if needed
    selectedProvider = 'openai'
    aiService = createAIService({ provider: selectedProvider })
  }
  console.log(`LLM provider selected: ${selectedProvider}`)
  if (!aiService) throw new Error('AI provider not configured')

  const prompt = `You are a sophisticated financial data analyst API. Your purpose is to deconstruct a user's natural language query about Registered Investment Advisors (RIAs) and transform it into a structured JSON object for a multi-faceted database search. Analyze the user's query: "${userQuery}".

Your response MUST be a valid JSON object with two top-level keys: "semantic_query" and "structured_filters".

1. "semantic_query": This should be an enhanced, semantically rich version of the user's query, suitable for vector database search.
- Correct spelling and grammatical errors (e.g., "Sant Louis" -> "Saint Louis").
- Expand abbreviations (e.g., "St." -> "Saint", "MO" -> "Missouri").
- Clarify intent (e.g., "rias that do private placements" -> "Registered Investment Advisors that offer private placement investment opportunities to clients").
- The goal is to create a descriptive phrase that will match well against the 'narrative' embeddings in the database.

2. "structured_filters": This should be a JSON object containing specific, structured data points extracted from the query.
- Valid keys are: "location", "min_aum", "max_aum", "services".
- "location": Normalize to "City, ST" format (e.g., "Saint Louis, MO").
- "min_aum", "max_aum": Extract numerical values for Assets Under Management.
- "services": Extract specific financial services mentioned, like "private placements", "retirement planning", etc.

Return ONLY the raw JSON object. Do not include markdown formatting or any other explanatory text.`

  const result = await aiService.generateText(prompt)
  const text = result.text?.trim() || ''

  // Some LLMs might wrap with code fences – strip them
  const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(stripped)
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure')
    if (!parsed.semantic_query || !parsed.structured_filters) throw new Error('Missing required keys')
    return parsed as QueryDecomposition
  } catch (e) {
    // Retry once
    const retry = await aiService.generateText(prompt)
    const retryText = retry.text?.trim() || ''
    const retryStripped = retryText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    try {
      const parsed = JSON.parse(retryStripped)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure')
      if (!parsed.semantic_query || !parsed.structured_filters) throw new Error('Missing required keys')
      return parsed as QueryDecomposition
    } catch (err) {
      console.error('LLM decomposition failed. Raw output:', retryText)
      throw new Error('Failed to understand query')
    }
  }
}

async function generateVertex384Embedding(text: string): Promise<number[] | null> {
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  if (!projectId) return null

  try {
    // Use Application Default Credentials
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const accessToken = await auth.getAccessToken()
    if (!accessToken) return null

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`
    const body = {
      instances: [{ content: text, outputDimensionality: 384 }],
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errText = await response.text()
      console.warn('Vertex embedding HTTP error', response.status, errText)
      return null
    }
    const result = (await response.json()) as any
    const embedding = result?.predictions?.[0]?.embeddings?.values
    return Array.isArray(embedding) ? embedding : null
  } catch (e) {
    console.warn('Vertex embedding failed:', (e as any)?.message || e)
    return null
  }
}

function decodeJwtSub(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const parts = authorizationHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  const token = parts[1]
  const segments = token.split('.')
  if (segments.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return payload?.sub || null
  } catch {
    return null
  }
}

function parseAnonCookie(req: NextRequest): { count: number } {
  const cookie = req.cookies.get('rh_qc')?.value
  const count = cookie ? Number(cookie) || 0 : 0
  return { count }
}

function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers)
  headers.append('Set-Cookie', `rh_qc=${newCount}; Path=/; Max-Age=2592000; SameSite=Lax`)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const userId = decodeJwtSub(authHeader)
    const body = await req.json().catch(() => null)
    if (!body || typeof body.query !== 'string') {
      return corsify(req, NextResponse.json({ error: 'Invalid body. Expected { "query": string }', code: 'BAD_REQUEST' }, { status: 400 }))
    }

    const { query } = body as { query: string; aiProvider?: AIProvider }

    // Auth and allowance
    let allowed = true
    let remaining = -1
    let isSubscriber = false
    let needsCookieUpdate = false
    let anonCount = 0

    if (userId) {
      const limit = await checkQueryLimit(userId)
      allowed = limit.allowed
      remaining = limit.remaining
      isSubscriber = limit.isSubscriber
      if (!allowed) {
        return corsify(
          req,
          NextResponse.json(
            {
              error: limit.isSubscriber
                ? 'Subscription expired. Please renew your subscription to continue.'
                : 'Free query limit reached. Upgrade to continue.',
              code: 'PAYMENT_REQUIRED',
              remaining: limit.remaining,
              isSubscriber: limit.isSubscriber,
              upgradeRequired: true,
            },
            { status: 402 },
          ),
        )
      }
    } else {
      const anon = parseAnonCookie(req)
      anonCount = anon.count
      if (anonCount >= 2) {
        return corsify(
          req,
          NextResponse.json(
            {
              error: 'Free query limit reached. Create an account for more searches.',
              code: 'PAYMENT_REQUIRED',
              remaining: 0,
              isSubscriber: false,
              upgradeRequired: true,
            },
            { status: 402 },
          ),
        )
      }
      needsCookieUpdate = true
    }

    // Decompose query with LLM
    const decomposition = await callLLMToDecomposeQuery(query)

    // Generate embedding for semantic query (Vertex 384). If unavailable, skip vector step
    const embedding = await generateVertex384Embedding(decomposition.semantic_query)

    // Vector search to get relevant CRDs
    let matchedCrds: string[] = []
    if (embedding && Array.isArray(embedding) && embedding.length === 384) {
      const { data: matches, error } = await supabaseAdmin.rpc('match_narratives', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 50,
      })
      if (error) {
        console.warn('Vector RPC error:', error.message)
      } else if (Array.isArray(matches)) {
        matchedCrds = matches.map((m: any) => String(m.crd_number))
      }
    } else {
      console.log('Skipping vector search: no compatible embedding available')
    }

    // Structured query
    const filters = decomposition.structured_filters || {}
    const { city, state } = parseLocation(filters.location)
    let q = supabaseAdmin.from('ria_profiles').select('*')
    if (state) q = q.ilike('state', state)
    if (city) q = q.ilike('city', `%${city}%`)
    if (typeof filters.min_aum === 'number') q = q.gte('aum', filters.min_aum)
    if (typeof filters.max_aum === 'number' && filters.max_aum !== null) q = q.lte('aum', filters.max_aum)
    if (Array.isArray(filters.services) && filters.services.length > 0) {
      const servicesLower = filters.services.map((s) => s.toLowerCase())
      const privatePlacementSynonyms = new Set<string>([
        'private placement',
        'private placements',
        'private fund',
        'private funds',
        'private equity',
        'hedge fund',
        'hedge funds',
        'alternative investment',
        'alternative investments',
        'alternatives',
        'alts',
        'accredited investor',
        'venture capital',
        'vc fund',
      ])
      const hasPrivatePlacementIntent = servicesLower.some((svc) =>
        Array.from(privatePlacementSynonyms).some((syn) => svc.includes(syn)),
      )
      if (hasPrivatePlacementIntent) {
        q = q.gt('private_fund_count', 0)
      }
    }
    if (matchedCrds.length > 0) q = q.in('crd_number', matchedCrds)

    // Superlatives and top-N
    const sq = (decomposition.semantic_query || '').toLowerCase()
    const topMatch = sq.match(/top\s+(\d+)/)
    const isLargest = sq.includes('largest') || topMatch !== null
    const isSmallest = sq.includes('smallest')
    if (isLargest) q = q.order('aum', { ascending: false })
    if (isSmallest) q = q.order('aum', { ascending: true })

    const topN = topMatch ? Math.max(1, Math.min(50, Number(topMatch[1]) || 5)) : 50
    const { data: riaRows, error: riaError } = await q.limit(topN)
    if (riaError) {
      console.error('Structured query error:', riaError)
      return corsify(req, NextResponse.json({ error: 'Query failed', code: 'INTERNAL_ERROR' }, { status: 500 }))
    }

    const results = (riaRows || []).map((r: any) => ({
      // Canonical preferred
      legal_name: r.legal_name,
      cik: String(r.crd_number),
      main_addr_city: r.city,
      main_addr_state: r.state,
      total_aum: r.aum,
      filing_date: r.form_adv_date,
      // Aliases for compatibility
      crd_number: r.crd_number,
      city: r.city,
      state: r.state,
      aum: r.aum,
      private_fund_count: r.private_fund_count,
      private_fund_aum: r.private_fund_aum,
      form_adv_date: r.form_adv_date,
    }))

    // Log usage
    if (userId) {
      await logQueryUsage(userId)
    }

    let response = corsify(
      req,
      NextResponse.json({
        results,
        remaining: userId ? (isSubscriber ? -1 : Math.max(0, (remaining || 0) - 1)) : Math.max(0, 2 - (anonCount + 1)),
        isSubscriber: !!isSubscriber,
      }),
    )
    if (!userId && needsCookieUpdate) {
      response = withAnonCookie(response, anonCount + 1)
    }
    return response
  } catch (error) {
    console.error('v1 query endpoint error:', error)
    return corsify(req, NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 }))
  }
}


