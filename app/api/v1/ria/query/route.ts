import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAIService, getAIProvider, type AIProvider } from '@/lib/ai-providers'

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
  const titled = titleCase(s)
  const lowerKey = Object.keys(map).find((k) => k.toLowerCase() === s.toLowerCase())
  return map[titled] || (lowerKey ? map[lowerKey] : s.toUpperCase())
}

// Generate robust variants for a state input (code and full name forms)
function generateStateVariants(input?: string): string[] {
  if (!input) return []
  const code = normalizeState(input) || input.toUpperCase()
  const fullByCode: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  }
  const name = fullByCode[code]
  const variants = new Set<string>()
  variants.add(code)
  if (name) {
    variants.add(titleCase(name))
    variants.add(name.toUpperCase())
  }
  return Array.from(variants)
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function generateCityVariants(rawCity?: string): string[] {
  if (!rawCity) return []
  const base = rawCity
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const t = base.toLowerCase()

  const variants = new Set<string>()

  // Base forms
  variants.add(titleCase(base))
  variants.add(base.toUpperCase())

  // Saint variants (St, St., Saint) with dotted and undotted forms
  if (/\bst\b|\bst\.|\bsaint\b/i.test(t)) {
    const saint = t.replace(/\bst\.?\s+/i, 'saint ').replace(/\bsaint\s+/i, 'saint ')
    const st = t.replace(/\bsaint\s+/i, 'st ').replace(/\bst\.?\s+/i, 'st ')
    // Explicit dotted shorthand (e.g., "St. Louis") to match DB entries that retain the period
    const stDot = t.replace(/\bsaint\s+/i, 'st. ').replace(/\bst\.?\s+/i, 'st. ')

    const saintTC = titleCase(saint)
    const stTC = titleCase(st)
    const stDotTC = titleCase(stDot)
    variants.add(saintTC)
    variants.add(stTC)
    variants.add(stDotTC)
    variants.add(saintTC.toUpperCase())
    variants.add(stTC.toUpperCase())
    variants.add(stDotTC.toUpperCase())
  }

  // Fort / Mount variants
  if (/\bft\b|\bft\.|\bfort\b/i.test(t)) {
    const fort = t.replace(/\bft\.?\s+/i, 'fort ')
    variants.add(titleCase(fort))
    variants.add(titleCase(fort).toUpperCase())
  }
  if (/\bmt\b|\bmt\.|\bmount\b/i.test(t)) {
    const mount = t.replace(/\bmt\.?\s+/i, 'mount ')
    variants.add(titleCase(mount))
    variants.add(titleCase(mount).toUpperCase())
  }

  // "New" compounds: allow missing space or hyphen
  if (/^new\s?[a-z]/i.test(t)) {
    const withSpace = t.replace(/^new\s?([a-z]+)/i, (_m, p1) => `new ${p1}`)
    variants.add(titleCase(withSpace))
    variants.add(titleCase(withSpace).toUpperCase())
  }

  // Super-loose: add punctuation-stripped and wildcard variants
  const tokenized = t.replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (tokenized) {
    const compact = tokenized.replace(/\s+/g, '') // saintlouis
    const loose = tokenized.replace(/\s+/g, '%')   // saint%louis
    variants.add(titleCase(compact))
    variants.add(compact.toUpperCase())
    variants.add(loose.toUpperCase())
  }

  // Synonym expansions for common metros
  const synonyms: Record<string, string[]> = {
    'saint louis': ['st louis', 'st. louis', 'st-louis', 'stl', 'saintlouis'],
    'new york': ['new york city', 'nyc', 'newyork', 'new-york'],
  }
  const key = tokenized
  const matchKey = Object.keys(synonyms).find((k) => key.includes(k))
  if (matchKey) {
    for (const syn of synonyms[matchKey]) {
      const tc = titleCase(syn)
      variants.add(tc)
      variants.add(tc.toUpperCase())
    }
  }

  return Array.from(variants)
}

// Normalize a firm name to a canonical form for grouping
function normalizeFirmName(input?: string | null): string {
  if (!input) return ''
  let s = input
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[.,']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Remove common entity suffixes and boilerplate words at end of names
  // Do conservative removals to avoid over-grouping unrelated firms
  const suffixes = [
    ' INCORPORATED',
    ' INC',
    ' LLC',
    ' L L C',
    ' LLP',
    ' L L P',
    ' LP',
    ' L P',
    ' CO',
    ' COMPANY',
    ' CORPORATION',
    ' CORP',
  ]
  for (const suf of suffixes) {
    s = s.replace(new RegExp(`${suf}$`), '')
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

type FirmResult = {
  legal_name: string
  cik: string
  main_addr_city: string
  main_addr_state: string
  total_aum: number
  filing_date: any
  source: string
  sourceCategory: string
  matchReason: string
  crd_number: string
  city: string
  state: string
  aum: number
  private_fund_count?: number
  private_fund_aum?: number
  form_adv_date?: any
}

function aggregateFirmResults(
  rows: FirmResult[],
  options: { sortByAum?: 'asc' | 'desc'; topN?: number } = {},
) {
  const groups = new Map<
    string,
    {
      key: string
      displayName: string
      totalAum: number
      privateFundCount: number
      privateFundAum: number
      cities: Record<string, number>
      states: Record<string, number>
      crds: Set<string>
      members: FirmResult[]
    }
  >()

  for (const r of rows) {
    const key = normalizeFirmName(r.legal_name)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        displayName: r.legal_name,
        totalAum: Number(r.aum) || 0,
        privateFundCount: Number(r.private_fund_count || 0),
        privateFundAum: Number(r.private_fund_aum || 0),
        cities: { [r.city || r.main_addr_city || '']: 1 },
        states: { [r.state || r.main_addr_state || '']: 1 },
        crds: new Set([String(r.crd_number || r.cik)]),
        members: [r],
      })
    } else {
      const g = groups.get(key)!
      g.totalAum += Number(r.aum) || 0
      g.privateFundCount += Number(r.private_fund_count || 0)
      g.privateFundAum += Number(r.private_fund_aum || 0)
      const c = r.city || r.main_addr_city || ''
      const st = r.state || r.main_addr_state || ''
      g.cities[c] = (g.cities[c] || 0) + 1
      g.states[st] = (g.states[st] || 0) + 1
      g.crds.add(String(r.crd_number || r.cik))
      // Prefer the longest legal name as display
      if ((r.legal_name || '').length > (g.displayName || '').length) {
        g.displayName = r.legal_name
      }
      g.members.push(r)
    }
  }

  // Convert to response items
  let items = Array.from(groups.values()).map((g) => {
    const pickMode = (rec: Record<string, number>) =>
      Object.entries(rec)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || ''

    const city = pickMode(g.cities)
    const state = pickMode(g.states)
    return {
      legal_name: g.displayName,
      cik: Array.from(g.crds)[0],
      main_addr_city: city,
      main_addr_state: state,
      total_aum: g.totalAum,
      filing_date: g.members[0]?.filing_date ?? null,
      source: rows[0]?.source || 'database',
      sourceCategory: rows[0]?.sourceCategory || 'database',
      matchReason: rows[0]?.matchReason || 'geo+filters',
      // Compatibility fields
      crd_number: Array.from(g.crds)[0],
      city,
      state,
      aum: g.totalAum,
      private_fund_count: g.privateFundCount,
      private_fund_aum: g.privateFundAum,
      form_adv_date: g.members[0]?.form_adv_date ?? null,
      // Enriched metadata
      aggregated: true,
      group_size: g.members.length,
      crd_numbers: Array.from(g.crds),
    }
  })

  if (options.sortByAum) {
    items.sort((a, b) =>
      options.sortByAum === 'asc' ? (a.total_aum || 0) - (b.total_aum || 0) : (b.total_aum || 0) - (a.total_aum || 0),
    )
  }
  if (options.topN && options.topN > 0) {
    items = items.slice(0, options.topN)
  }
  return items
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

function fallbackDecompose(userQuery: string): QueryDecomposition {
  const q = userQuery.trim()
  // Extract top N
  const topMatch = q.toLowerCase().match(/top\s+(\d+)/)
  // Extract state name or safe abbreviation (avoid matching the preposition "in")
  const fullStateMatch = q.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i)
  const STATE_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])
  let abbrev: string | undefined
  const abbrevMatches = Array.from(q.matchAll(/\b([A-Za-z]{2})\b/g))
  for (const m of abbrevMatches) {
    const token = m[1].toUpperCase()
    if (STATE_CODES.has(token)) { abbrev = token; break }
  }
  // Heuristic city extraction: look for "in <City>" or common St Louis variants
  let city: string | undefined
  const inCity = q.match(/\bin\s+([A-Za-z.\s]+?)(?:,\s*[A-Za-z]{2}|$)/i)
  if (inCity) city = inCity[1].trim()
  if (/\b(st\.?|saint)\s+louis\b/i.test(q)) city = 'Saint Louis'
  if (/\bstl\b/i.test(q)) city = 'Saint Louis'
  if (/\bnyc\b|\bnew\s+york\s+city\b/i.test(q)) { city = 'New York'; if (!abbrev && !fullStateMatch) { abbrev = 'NY' } }
  let state = normalizeState((fullStateMatch?.[0] as string) || (abbrev as string | undefined))
  // Prefer MO for Saint Louis when state is absent
  if (!state && city && /saint\s+louis/i.test(city)) state = 'MO'
  const location = city && state ? `${city}, ${state}` : city ? city : state ? state : null
  // AUM extraction like $500m / $1 billion
  let min_aum: number | null = null
  const aumMatch = q.toLowerCase().match(/(over|greater than|at least|>=?)\s*\$?\s*([0-9.,]+)\s*(b|bn|billion|m|mm|million)?/)
  if (aumMatch) {
    const num = parseFloat(aumMatch[2].replace(/[,]/g, ''))
    const unit = aumMatch[3]
    const factor = !unit ? 1 : /b|bn|billion/i.test(unit) ? 1_000_000_000 : /m|mm|million/i.test(unit) ? 1_000_000 : 1
    min_aum = Math.round(num * factor)
  }
  // Services intent
  const services: string[] = []
  if (/private\s+(placement|fund|equity)|hedge\s+fund|alternative/i.test(q)) {
    services.push('private placements')
  }
  const semantic_query = `Registered Investment Advisors ${location ? 'in ' + location : ''}${min_aum ? ` with over $${min_aum.toLocaleString()} AUM` : ''}${services.length ? ' that offer private placement or alternative investment services' : ''}`.trim()
  return {
    semantic_query: semantic_query.length > 0 ? semantic_query : q,
    structured_filters: {
      location,
      min_aum: min_aum ?? null,
      max_aum: null,
      services: services.length ? services : null,
    },
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
    if (!body || (typeof body.query !== 'string' && !body.crd_number)) {
      return corsify(req, NextResponse.json({ error: 'Invalid body. Expected { "query": string } or { "crd_number": string }', code: 'BAD_REQUEST' }, { status: 400 }))
    }

    const { query, crd_number, exact_match, limit } = body as { 
      query?: string; 
      crd_number?: string; 
      exact_match?: boolean; 
      limit?: number;
      aiProvider?: AIProvider 
    }

    // Handle exact CRD/CIK lookup
    if (crd_number && exact_match) {
      try {
        console.log(`🎯 Exact match requested for CRD/CIK: ${crd_number}`)
        
        // Try CRD first (most reliable), then CIK
        let profile = null
        
        // Try numeric CRD first
        const numericCrd = parseInt(crd_number, 10)
        if (!isNaN(numericCrd)) {
          const { data: crdProfile, error: crdError } = await supabaseAdmin
            .from('ria_profiles')
            .select('*')
            .eq('crd_number', numericCrd)
            .single()
          
          if (crdProfile && !crdError) {
            profile = crdProfile
            console.log(`✅ Found by CRD number: ${crdProfile.legal_name}`)
          } else if (crdError) {
            console.log(`CRD query error:`, crdError.message)
          }
        }
        
        // If not found by CRD, try CIK (if column exists)
        if (!profile) {
          try {
            const { data: cikProfile, error: cikError } = await supabaseAdmin
              .from('ria_profiles')
              .select('*')
              .eq('cik', crd_number)
              .single()
            
            if (cikProfile && !cikError) {
              profile = cikProfile
              console.log(`✅ Found by CIK: ${cikProfile.legal_name}`)
            } else if (cikError && cikError.code !== '42703') {
              console.log(`CIK query error:`, cikError.message)
            }
          } catch (err: any) {
            // Ignore CIK column errors (column might not exist)
            if (err?.code !== '42703') {
              console.log(`CIK query exception:`, err.message)
            }
          }
        }

        if (profile) {
          // Log usage and return exact match
          if (userId) await logQueryUsage(userId)
          
          const response = NextResponse.json({
            results: [{
              ...profile,
              source: 'database',
              sourceCategory: 'exact_match',
              matchReason: `exact_crd_cik_${crd_number}`
            }],
            total: 1,
            remaining,
            isSubscriber,
            query: `CRD/CIK ${crd_number}`,
            decomposition: { semantic_query: '', structured_filters: {} }
          })
          
          if (needsCookieUpdate) {
            response.cookies.set('anonQueries', String(anonCount + 1), { maxAge: 86400 })
          }
          return corsify(req, response)
        } else {
          console.log(`❌ No profile found for CRD/CIK: ${crd_number}`)
          return corsify(req, NextResponse.json({
            results: [],
            total: 0,
            remaining,
            isSubscriber,
            query: `CRD/CIK ${crd_number}`,
            decomposition: { semantic_query: '', structured_filters: {} }
          }))
        }
      } catch (error) {
        console.error('Exact match error:', error)
        return corsify(req, NextResponse.json({ error: 'Exact match failed', code: 'INTERNAL_ERROR' }, { status: 500 }))
      }
    }

    // Fall back to semantic search if no exact match requested
    const queryString = query || `Profile ${crd_number}`

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
    let decomposition: QueryDecomposition
    try {
      decomposition = await callLLMToDecomposeQuery(queryString)
    } catch (e) {
      // Fallback to deterministic parser when LLM fails
      decomposition = fallbackDecompose(queryString)
    }

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
    if (state) {
      const stateVars = generateStateVariants(state)
      if (stateVars.length === 1) {
        q = q.ilike('state', `%${stateVars[0]}%`)
      } else {
        const stateOr = stateVars.map((sv) => `state.ilike.%${sv}%`).join(',')
        q = q.or(stateOr)
      }
    }
    let appliedCityFilter = false
    if (city) {
      const cityVariants = generateCityVariants(city)
      if (cityVariants.length === 1) {
        q = q.ilike('city', `%${cityVariants[0]}%`)
        appliedCityFilter = true
      } else if (cityVariants.length > 1) {
        const orConditions = cityVariants.map((cv) => `city.ilike.%${cv}%`).join(',')
        q = q.or(orConditions)
        appliedCityFilter = true
      }
    }
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
    // Only intersect with vector results when no structured filters are applied
    const structuredApplied = !!(city || state || (Array.isArray(filters.services) && filters.services.length) || typeof filters.min_aum === 'number' || (typeof filters.max_aum === 'number' && filters.max_aum !== null))
    if (matchedCrds.length > 0 && !structuredApplied) q = q.in('crd_number', matchedCrds)

    // Superlatives and top-N
    const sq = (decomposition.semantic_query || '').toLowerCase()
    const topMatch = sq.match(/top\s+(\d+)/)
    const isLargest = sq.includes('largest') || topMatch !== null
    const isSmallest = sq.includes('smallest')
    if (isLargest) q = q.order('aum', { ascending: false })
    if (isSmallest) q = q.order('aum', { ascending: true })

    // Fetch more rows than needed so aggregation can combine affiliates
    const topN = topMatch ? Math.max(1, Math.min(50, Number(topMatch[1]) || 5)) : 50
    const fetchLimit = Math.min(200, topN * 5)
    let { data: riaRows, error: riaError } = await q.limit(fetchLimit)
    if (riaError) {
      console.error('Structured query error:', riaError)
      return corsify(req, NextResponse.json({ error: 'Query failed', code: 'INTERNAL_ERROR' }, { status: 500 }))
    }

    // Relaxation ladder
    let relaxationLevel: 'state' | 'vector-only' | null = null
    if ((!riaRows || riaRows.length === 0) && state && appliedCityFilter) {
      // Step 1: relax to state only
      let relaxedState = supabaseAdmin.from('ria_profiles').select('*').ilike('state', state)
      if (typeof filters.min_aum === 'number') relaxedState = relaxedState.gte('aum', filters.min_aum)
      if (typeof filters.max_aum === 'number' && filters.max_aum !== null) relaxedState = relaxedState.lte('aum', filters.max_aum)
      if (isLargest) relaxedState = relaxedState.order('aum', { ascending: false })
      if (isSmallest) relaxedState = relaxedState.order('aum', { ascending: true })
      const rs = await relaxedState.limit(fetchLimit)
      if (!rs.error && rs.data && rs.data.length > 0) {
        riaRows = rs.data
        relaxationLevel = 'state'
      }
    }
    if ((!riaRows || riaRows.length === 0) && matchedCrds.length > 0 && relaxationLevel === null) {
      // Step 2: vector-only
      let relaxed = supabaseAdmin.from('ria_profiles').select('*').in('crd_number', matchedCrds)
      if (typeof filters.min_aum === 'number') relaxed = relaxed.gte('aum', filters.min_aum)
      if (typeof filters.max_aum === 'number' && filters.max_aum !== null) relaxed = relaxed.lte('aum', filters.max_aum)
      if (isLargest) relaxed = relaxed.order('aum', { ascending: false })
      if (isSmallest) relaxed = relaxed.order('aum', { ascending: true })
      const rr = await relaxed.limit(fetchLimit)
      if (!rr.error && rr.data) {
        riaRows = rr.data
        relaxationLevel = 'vector-only'
      }
    }

    const usedVector = matchedCrds.length > 0
    const rawResults: FirmResult[] = (riaRows || []).map((r: any) => ({
      // Canonical preferred
      legal_name: r.legal_name,
      cik: String(r.crd_number),
      main_addr_city: r.city,
      main_addr_state: r.state,
      total_aum: r.aum,
      filing_date: r.form_adv_date,
      source: usedVector ? 'vector+filters' : 'filters-only',
      sourceCategory: usedVector ? 'hybrid' : 'database',
      matchReason: relaxationLevel === 'vector-only' ? 'vector-only' : 'geo+filters',
      // Aliases for compatibility
      crd_number: r.crd_number,
      city: r.city,
      state: r.state,
      aum: r.aum,
      private_fund_count: r.private_fund_count,
      private_fund_aum: r.private_fund_aum,
      form_adv_date: r.form_adv_date,
    }))

    // Aggregate affiliated records by normalized firm name
    const results = aggregateFirmResults(rawResults, {
      sortByAum: isLargest ? 'desc' : isSmallest ? 'asc' : undefined,
      topN,
    })

    // Log usage
    if (userId) {
      await logQueryUsage(userId)
    }

    let response = corsify(
      req,
      NextResponse.json({
        results,
        total: results.length,
        remaining: userId ? (isSubscriber ? -1 : Math.max(0, (remaining || 0) - 1)) : Math.max(0, 2 - (anonCount + 1)),
        isSubscriber: !!isSubscriber,
        query: queryString,
        decomposition,
        meta: {
          relaxed: relaxationLevel !== null,
          relaxationLevel,
          resolvedRegion: { city: city || null, state: state || null },
          n: topMatch ? Math.max(1, Math.min(50, Number(topMatch[1]) || 5)) : null,
          aggregated: true,
          fetched: (riaRows || []).length,
        },
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


