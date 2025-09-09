import { createAIService, getAIProvider, type AIProvider } from '@/lib/ai-providers'

export type StructuredFilters = {
	location?: string | null
	min_aum?: number | null
	max_aum?: number | null
	services?: string[] | null
}

export type QueryPlan = {
	semantic_query: string
	structured_filters: StructuredFilters
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

export async function callLLMToDecomposeQuery(userQuery: string, provider?: AIProvider): Promise<QueryPlan> {
	let selectedProvider = getAIProvider(provider)
	let aiService = createAIService({ provider: selectedProvider })
	if (!aiService) {
		selectedProvider = 'openai'
		aiService = createAIService({ provider: selectedProvider })
	}
	// If no AI configured, fall back to deterministic parser instead of failing
	if (!aiService) return fallbackDecompose(userQuery)

	const prompt = `You are a sophisticated financial data analyst API. Your purpose is to deconstruct a user's natural language query about Registered Investment Advisors (RIAs) and transform it into a structured JSON object for a multi-faceted database search. Analyze the user's query: "${userQuery}".

Your response MUST be a valid JSON object with two top-level keys: "semantic_query" and "structured_filters".

1. "semantic_query": This should be an enhanced, semantically rich version of the user's query, suitable for vector database search.
- Correct spelling and grammatical errors (e.g., "Sant Louis" -> "Saint Louis").
- Expand abbreviations (e.g., "St." -> "Saint", "MO" -> "Missouri").
- Clarify intent (e.g., "rias that do private placements" -> "Registered Investment Advisors that offer private placement investment opportunities to clients").
- The goal is to create a descriptive phrase that will match well against the 'narrative' embeddings in the database.

2. "structured_filters": This should be a JSON object containing specific, structured data points extracted from the query.
- Valid keys are: "location", "min_aum", "max_aum", "services".
- "location": CRITICAL - Extract ANY location mentioned (city, state, or both). For "St. Louis" or "Saint Louis", always return "Saint Louis, MO". For any Missouri city, include ", MO". Normalize to "City, ST" format.
- "min_aum", "max_aum": Extract numerical values for Assets Under Management.
- "services": Extract specific financial services mentioned, like "private placements", "retirement planning", etc.

IMPORTANT: If the query mentions ANY location (like "in St. Louis", "in Missouri", "in New York"), you MUST extract it to the location field.

Examples:
- Query: "largest RIAs in St. Louis" -> location: "Saint Louis, MO"
- Query: "top firms in Missouri" -> location: "MO"
- Query: "biggest advisors in Saint Louis" -> location: "Saint Louis, MO"

Return ONLY the raw JSON object. Do not include markdown formatting or any other explanatory text.`

	const result = await aiService.generateText(prompt)
	const text = result.text?.trim() || ''
	const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
	try {
		const parsed = JSON.parse(stripped)
		if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure')
		if (!parsed.semantic_query || !parsed.structured_filters) throw new Error('Missing required keys')
		return parsed as QueryPlan
	} catch {
		// Deterministic fallback
		return fallbackDecompose(userQuery)
	}
}

function fallbackDecompose(userQuery: string): QueryPlan {
	const q = userQuery.trim()
	const topMatch = q.toLowerCase().match(/top\s+(\d+)/)
	const fullStateMatch = q.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i)
	const STATE_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])
	let abbrev: string | undefined
	const abbrevMatches = Array.from(q.matchAll(/\b([A-Z]{2})\b/g))
	for (const m of abbrevMatches) {
		const token = m[1]
		if (STATE_CODES.has(token)) { abbrev = token; break }
	}
	let city: string | undefined
	const inCity = q.match(/\bin\s+([A-Za-z.\s]+?)(?:,\s*[A-Za-z]{2}|$)/i)
	if (inCity) city = inCity[1].trim()
	if (/\b(st\.?|saint)\s+louis\b/i.test(q)) city = 'Saint Louis'
	let state = normalizeState((fullStateMatch?.[0] as string) || (abbrev as string | undefined))
	if (!state && city && /saint\s+louis/i.test(city)) state = 'MO'
	const location = city && state ? `${city}, ${state}` : city ? city : state ? state : null
	let min_aum: number | null = null
	const aumMatch = q.toLowerCase().match(/(over|greater than|at least|>=?)\s*\$?\s*([0-9.,]+)\s*(b|bn|billion|m|mm|million)?/)
	if (aumMatch) {
		const num = parseFloat(aumMatch[2].replace(/[,]/g, ''))
		const unit = aumMatch[3]
		const factor = !unit ? 1 : /b|bn|billion/i.test(unit) ? 1_000_000_000 : /m|mm|million/i.test(unit) ? 1_000_000 : 1
		min_aum = Math.round(num * factor)
	}
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


