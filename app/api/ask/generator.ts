import { createAIService, getAIProvider } from '@/lib/ai-providers'
import OpenAI from 'openai'

export async function generateNaturalLanguageAnswer(query: string, context: string): Promise<string> {
	const provider = getAIProvider('openai')
	const ai = createAIService({ provider })
	if (!ai) throw new Error('AI provider not configured')

	const prompt = [
		'You are a factual analyst. Answer the user question using ONLY the provided context.',
		'If specific details are missing, provide what information you can from the available data and mention what details are not available. Provide the best possible answer with the data provided.',
		'Be concise, structured, and include a brief ranked list if relevant.',
		'',
		`Context:\n${context}`,
		'',
		`Question: ${query}`,
	].join('\n')

	const result = await ai.generateText(prompt)
	return (result.text || '').trim()
}

export function generateNaturalLanguageAnswerStream(query: string, context: string): ReadableStream<Uint8Array> {
	const apiKey = process.env.OPENAI_API_KEY!
	const client = new OpenAI({ apiKey })
	const encoder = new TextEncoder()

	const prompt = [
		'You are a factual analyst. Answer the user question using ONLY the provided context.',
		'If specific details are missing, provide what information you can from the available data and mention what details are not available. Provide the best possible answer with the data provided.',
		'Be concise, structured, and include a brief ranked list if relevant.',
		'',
		`Context:\n${context}`,
		'',
		`Question: ${query}`,
	].join('\n')

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				const stream = await client.chat.completions.create({
					model: 'gpt-4o',
					messages: [
						{ role: 'system', content: 'You are a helpful assistant.' },
						{ role: 'user', content: prompt },
					],
					stream: true,
					temperature: 0.2,
					max_tokens: 800,
				})
				for await (const part of stream) {
					const delta = part.choices?.[0]?.delta?.content || ''
					if (delta) controller.enqueue(encoder.encode(delta))
				}
				controller.close()
			} catch (err) {
				controller.error(err)
			}
		},
	})
}

export async function* streamAnswerTokens(query: string, context: string) {
	const apiKey = process.env.OPENAI_API_KEY
	
	// Check if OpenAI API key is available
	if (!apiKey) {
		console.warn('[generator] OpenAI API key not configured, returning fallback response');
		// Return a friendly fallback message when LLM is unavailable
		const fallbackMessage = `I couldn't reach the AI model right now, but here's what I found in the database:\n\n${context}\n\nBased on this information, ${query.toLowerCase()}`;
		yield fallbackMessage;
		return;
	}
	
	try {
		const client = new OpenAI({ apiKey });
		const prompt = [
			'You are a factual analyst. Answer the user question using ONLY the provided context.',
			'If specific details are missing, provide what information you can from the available data and mention what details are not available. Provide the best possible answer with the data provided.',
			'Be concise, structured, and include a brief ranked list if relevant.',
			'',
			`Context:\n${context}`,
			'',
			`Question: ${query}`,
		].join('\n');

		const stream = await client.chat.completions.create({
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: prompt },
			],
			stream: true,
			temperature: 0.2,
			max_tokens: 800,
		});
		
		for await (const part of stream) {
			const delta = part.choices?.[0]?.delta?.content || '';
			if (delta) {
				yield delta as string;
			}
		}
	} catch (error) {
		console.error('[generator] Error streaming from OpenAI:', error);
		// Provide a friendly fallback on error
		const errorFallback = `I encountered an issue while processing your request. Here's the raw context I found:\n\n${context}\n\nBased on this data, you might find relevant information about: ${query}`;
		yield errorFallback;
	}
}


