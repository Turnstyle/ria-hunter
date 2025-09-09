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

export async function callLLMToDecomposeQuery(userQuery: string, provider?: AIProvider): Promise<QueryPlan> {
	let selectedProvider = getAIProvider(provider)
	let aiService = createAIService({ provider: selectedProvider })
	if (!aiService) {
		selectedProvider = 'openai'
		aiService = createAIService({ provider: selectedProvider })
	}
	// If no AI service is available, return a simple decomposition
	if (!aiService) {
		console.warn('AI service not configured - using basic decomposition')
		return {
			semantic_query: userQuery,
			structured_filters: {
				location: null,
				min_aum: null,
				max_aum: null,
				services: null
			}
		}
	}

	const prompt = `You are a sophisticated financial data analyst. Analyze this query about Registered Investment Advisors (RIAs): "${userQuery}"

Return a JSON object with exactly two keys:

1. "semantic_query": An enhanced version of the query for semantic search. Simply clarify and expand the intent naturally to match well against database narratives.

2. "structured_filters": Extract these specific filters if mentioned:
   - "location": Any location mentioned (city, state, or both). Return exactly as semantically understood, in "City, State" format if both are present.
   - "min_aum": Minimum assets under management if specified (in dollars)
   - "max_aum": Maximum assets under management if specified (in dollars)  
   - "services": Specific services like "private placements", "venture capital", etc.

Important: Trust the semantic search to understand natural variations. The AI embeddings understand that "St. Louis", "St Louis", and "Saint Louis" all refer to the same city. Simply extract the location naturally without forcing specific spellings.

Return ONLY the raw JSON object, no markdown or explanations.`

	try {
		const result = await aiService.generateText(prompt)
		const text = result.text?.trim() || ''
		const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
		
		const parsed = JSON.parse(stripped)
		if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure from AI')
		if (!parsed.semantic_query || !parsed.structured_filters) throw new Error('Missing required keys in AI response')
		return parsed as QueryPlan
	} catch (error) {
		console.error('AI decomposition failed:', error)
		// Return basic decomposition on error
		return {
			semantic_query: userQuery,
			structured_filters: {
				location: null,
				min_aum: null,
				max_aum: null,
				services: null
			}
		}
	}
}