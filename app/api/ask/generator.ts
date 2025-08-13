import { createAIService, getAIProvider } from '@/lib/ai-providers'
import OpenAI from 'openai'

export async function generateNaturalLanguageAnswer(query: string, context: string): Promise<string> {
	const provider = getAIProvider('openai')
	const ai = createAIService({ provider })
	if (!ai) throw new Error('AI provider not configured')

	const prompt = [
		'You are a factual analyst. Answer the user question using ONLY the provided context.',
		'If the answer is not present, say you do not have enough data rather than guessing.',
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
		'If the answer is not present, say you do not have enough data rather than guessing.',
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


