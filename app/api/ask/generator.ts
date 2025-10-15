import { createAIService } from '@/lib/ai-providers'
import { createResilientAIService } from '@/lib/ai-resilience'

function buildPrompt(query: string, context: string): string {
	return [
		'You are a factual analyst. Answer the user question using ONLY the provided context.',
		'IMPORTANT RULES:',
		'1. If the user asks for addresses: Note that only city and state are available, not street addresses',
		'2. If the user asks for private fund activity: Show the fund count and total private fund AUM if available',
		'3. If specific details are missing: Provide what information you can and clearly state what is not available',
		'4. Always be transparent about data limitations while providing the best possible answer with available data',
		'Be concise, structured, and include a brief ranked list if relevant.',
		'',
		`Context:\n${context}`,
		'',
		`Question: ${query}`,
	].join('\n')
}

function fallbackResponse(query: string, context: string): string {
	return `Based on the search results:\n\n${context}\n\nNote: AI summarization is temporarily unavailable for the query "${query}".`
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
		return (result.text || '').trim()
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
				const text = (result.text || '').trim()

				if (!text) {
					controller.enqueue(encoder.encode(fallbackResponse(query, context)))
					controller.close()
					return
				}

				const words = text.split(' ')
				for (let i = 0; i < words.length; i++) {
					const chunk = i === 0 ? words[i] : ' ' + words[i]
					controller.enqueue(encoder.encode(chunk))

					if (process.env.NODE_ENV === 'development') {
						await new Promise(resolve => setTimeout(resolve, 20))
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
		const fullResponse = (result.text || '').trim()

		if (!fullResponse) {
			throw new Error('AI provider returned empty response')
		}

		const words = fullResponse.split(' ')
		for (let i = 0; i < words.length; i++) {
			const word = i === 0 ? words[i] : ' ' + words[i]
			yield word
			if (process.env.NODE_ENV === 'development') {
				await new Promise(resolve => setTimeout(resolve, 20))
			}
		}
	} catch (error) {
		console.error('Error generating AI response:', error)
		yield fallbackResponse(query, context)
	}
}
