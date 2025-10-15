import { createAIService } from '@/lib/ai-providers'
import { createResilientAIService } from '@/lib/ai-resilience'

const RESILIENCE_FALLBACK_SNIPPET = 'temporarily unable to generate a detailed response'

type ParsedEntry = {
	rank: number
	name: string
	details: string[]
}

type ParsedContext = {
	entries: ParsedEntry[]
	notes: string[]
}

function parseContext(context: string): ParsedContext {
	const entries: ParsedEntry[] = []
	const notes: string[] = []
	const lines = (context || '').split('\n')

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) continue

		if (/^note[:\s]/i.test(line)) {
			const noteText = line.replace(/^note[:\s]*/i, '').trim()
			if (noteText) {
				notes.push(noteText)
			}
			continue
		}

		const match = line.match(/^(\d+)\.\s*(.+)$/)
		if (!match) continue

		const rank = Number.parseInt(match[1], 10)
		const remainder = match[2]
		const parts = remainder
			.split('|')
			.map((part) => part.trim())
			.filter(Boolean)

		if (parts.length === 0) continue

		const [name, ...details] = parts

		entries.push({
			rank: Number.isFinite(rank) ? rank : entries.length + 1,
			name,
			details: details.map((detail) => detail.replace(/\s+/g, ' ').trim()),
		})
	}

	return { entries, notes }
}

function formatEntry(entry: ParsedEntry): string[] {
	const lines = [`${entry.rank}. ${entry.name}`]
	entry.details.forEach((detail) => {
		lines.push(`   ${detail}`)
	})
	return lines
}

function buildStructuredFallback(query: string, parsed: ParsedContext): string {
	const total = parsed.entries.length

	if (total === 0) {
		const lines = [`Semantic search did not return any RIAs for "${query}".`]
		for (const note of parsed.notes) {
			lines.push(`Data note: ${note}`)
		}
		lines.push('Sources: 0 RIAs from semantic search.')
		return lines.join('\n')
	}

	const topEntries = parsed.entries.slice(0, 10)
	const lines: string[] = [
		`Semantic search found ${total} RIAs matching "${query}". Top ${topEntries.length}:`,
		''
	]

	for (const entry of topEntries) {
		const entryLines = formatEntry(entry)
		lines.push(...entryLines)
		lines.push('')
	}

	for (const note of parsed.notes) {
		lines.push(`Data note: ${note}`)
	}

	lines.push(`Sources: ${total} RIAs from semantic search.`)
	return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function ensureSourcesSummary(text: string, parsed: ParsedContext): string {
	if (!text) {
		return `Sources: ${parsed.entries.length} RIAs from semantic search.`
	}

	if (text.toLowerCase().includes('sources:')) {
		return text
	}

	const suffix = `Sources: ${parsed.entries.length} RIAs from semantic search.`
	const needsBlankLine = !/\n\s*\n$/.test(text)
	const separator = needsBlankLine ? '\n\n' : '\n'
	return `${text}${separator}${suffix}`
}

function normalizeGeneratedText(resultText: string | undefined, query: string, context: string): string {
	const parsed = parseContext(context)
	const cleaned = (resultText || '').trim()
	const isEmpty = cleaned.length === 0
	const matchesResilienceFallback = cleaned.toLowerCase().includes(RESILIENCE_FALLBACK_SNIPPET)
	const candidate = !isEmpty && !matchesResilienceFallback
		? cleaned.replace(/^\s*-\s*(\d+\.)/gm, '$1').replace(/-\s{2,}/g, '- ')
		: buildStructuredFallback(query, parsed)

	return ensureSourcesSummary(candidate, parsed)
}

function buildPrompt(query: string, context: string): string {
	return [
		'You are a factual analyst. Answer the user question using ONLY the provided context.',
		'Formatting rules:',
		'1. Begin with a short sentence summarizing what the data shows for the query.',
		'2. Present each firm on its own line as a numbered list (e.g., "1. Firm Name"). Under each firm, add indented lines for key facts such as location, AUM, private fund activity, and executives.',
		'3. If details are missing, say "Not available" instead of inventing values.',
		'4. Restate any data limitations noted in the context (for example, only city and state are available).',
		'5. Keep the response scannable—avoid dense paragraphs or conversational filler.',
		'6. Leave a blank line between firms to prevent cramped text.',
		'7. Conclude with `Sources: <count> RIAs from semantic search.` using the count from the context when possible.',
		'',
		`Context:\n${context}`,
		'',
		`Question: ${query}`,
	].join('\n')
}

function fallbackResponse(query: string, context: string): string {
	const parsed = parseContext(context)
	return buildStructuredFallback(query, parsed)
}

export async function generateNaturalLanguageAnswer(query: string, context: string): Promise<string> {
	const ai = createResilientAIService(createAIService())

	if (!ai) {
		console.error('No AI service available - returning context-based response')
		return fallbackResponse(query, context)
	}

	try {
		const prompt = buildPrompt(query, context)
		const result = await ai.generateText(prompt)
		return normalizeGeneratedText(result.text, query, context)
	} catch (error) {
		console.error('Failed to generate AI response:', error)
		return fallbackResponse(query, context)
	}
}

export function generateNaturalLanguageAnswerStream(query: string, context: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const ai = createResilientAIService(createAIService())

			if (!ai) {
				controller.enqueue(encoder.encode(fallbackResponse(query, context)))
				controller.close()
				return
			}

			try {
				const prompt = buildPrompt(query, context)
				const result = await ai.generateText(prompt)
				const text = normalizeGeneratedText(result.text, query, context)
				const words = text.split(' ')
				for (let i = 0; i < words.length; i++) {
					const chunk = i === 0 ? words[i] : ' ' + words[i]
					controller.enqueue(encoder.encode(chunk))

					if (process.env.NODE_ENV === 'development') {
						await new Promise((resolve) => setTimeout(resolve, 20))
					}
				}

				controller.close()
			} catch (error) {
				console.error('Failed to stream AI response:', error)
				controller.error(error)
			}
		},
	})
}

export async function* streamAnswerTokens(query: string, context: string) {
	const ai = createResilientAIService(createAIService())

	if (!ai) {
		yield fallbackResponse(query, context)
		return
	}

	try {
		const prompt = buildPrompt(query, context)
		const result = await ai.generateText(prompt)
		const fullResponse = normalizeGeneratedText(result.text, query, context)

		const words = fullResponse.split(' ')
		for (let i = 0; i < words.length; i++) {
			const word = i === 0 ? words[i] : ' ' + words[i]
			yield word
			if (process.env.NODE_ENV === 'development') {
				await new Promise((resolve) => setTimeout(resolve, 20))
			}
		}
	} catch (error) {
		console.error('Error generating AI response:', error)
		yield fallbackResponse(query, context)
	}
}
