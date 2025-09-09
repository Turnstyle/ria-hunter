import { createAIService, getAIProvider } from '@/lib/ai-providers'
import OpenAI from 'openai'

export async function generateNaturalLanguageAnswer(query: string, context: string): Promise<string> {
	const provider = getAIProvider()
	const ai = createAIService({ provider })
	if (!ai) throw new Error('AI provider not configured')

	const prompt = [
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

	const result = await ai.generateText(prompt)
	return (result.text || '').trim()
}

export function generateNaturalLanguageAnswerStream(query: string, context: string): ReadableStream<Uint8Array> {
	const apiKey = process.env.OPENAI_API_KEY!
	const client = new OpenAI({ apiKey })
	const encoder = new TextEncoder()

	const prompt = [
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
	const currentProvider = getAIProvider();
	console.log(`[generator] Using AI provider: ${currentProvider}`);
	
	const prompt = [
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
	].join('\n');
	
	try {
		// Create AI service using the configured provider
		const ai = createAIService({ provider: currentProvider });
		if (!ai) {
			throw new Error(`AI provider ${currentProvider} not configured properly`);
		}
		
		console.log(`[generator] Generating response with ${currentProvider}...`);
		
		// Generate the full response
		const result = await ai.generateText(prompt);
		const fullResponse = result.text || '';
		
		if (!fullResponse) {
			throw new Error('AI provider returned empty response');
		}
		
		console.log(`[generator] Generated ${fullResponse.length} character response, simulating stream`);
		
		// Simulate streaming by yielding words with small delays
		const words = fullResponse.split(' ');
		for (let i = 0; i < words.length; i++) {
			const word = i === 0 ? words[i] : ' ' + words[i];
			yield word;
			// Small delay to simulate streaming (only in development)
			if (process.env.NODE_ENV === 'development') {
				await new Promise(resolve => setTimeout(resolve, 20));
			}
		}
		
	} catch (error) {
		console.error(`[generator] Error with AI provider ${currentProvider}:`, error);
		
		// Provide a graceful fallback with the context data
		console.log('[generator] Returning fallback response due to AI error');
		const fallbackMessage = `I encountered an issue generating a response, but here's what I found in the database:\n\n${context}\n\nBased on this information about ${query.toLowerCase()}.`;
		yield fallbackMessage;
	}
}


