import { createAIService, getAIProvider } from '@/lib/ai-providers'
import { createResilientAIService } from '@/lib/ai-resilience'
import OpenAI from 'openai'

export async function generateNaturalLanguageAnswer(query: string, context: string): Promise<string> {
	// Create primary and fallback services with resilience wrapper
	const primaryProvider = getAIProvider()
	const primaryService = createAIService({ provider: primaryProvider })
	
	// Create fallback service (OpenAI if primary is Vertex, or vice versa)
	const fallbackProvider = primaryProvider === 'vertex' ? 'openai' : 'vertex'
	const fallbackService = createAIService({ provider: fallbackProvider })
	
	// Wrap with circuit breaker and resilience features
	const ai = createResilientAIService(primaryService, fallbackService)
	
	if (!ai) {
		// Complete failure - return graceful degradation message
		console.error('No AI service available - returning context-based response')
		return `Based on the search results:\n\n${context}\n\nNote: AI summarization is temporarily unavailable.`
	}

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

	try {
		const result = await ai.generateText(prompt)
		return (result.text || '').trim()
	} catch (error) {
		// Even with circuit breaker, handle any unexpected errors
		console.error('Failed to generate AI response:', error)
		return `Based on the search results:\n\n${context}\n\nNote: AI summarization encountered an error.`
	}
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
	console.log(`[generator] Primary AI provider: ${currentProvider}`);
	
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
		// Create primary and fallback services with resilience wrapper
		const primaryService = createAIService({ provider: currentProvider });
		const fallbackProvider = currentProvider === 'vertex' ? 'openai' : 'vertex';
		const fallbackService = createAIService({ provider: fallbackProvider });
		
		// Wrap with circuit breaker and resilience features
		const ai = createResilientAIService(primaryService, fallbackService);
		
		if (!ai) {
			// Complete failure - yield graceful degradation message
			console.error('[generator] No AI service available - returning context-based response');
			yield `Based on the search results:\n\n${context}\n\nNote: AI summarization is temporarily unavailable.`;
			return;
		}
		
		console.log(`[generator] Generating response with resilient AI service...`);
		
		// Generate the full response with circuit breaker protection
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
		console.error(`[generator] Error with AI service:`, error);
		
		// Provide a graceful fallback with the context data
		console.log('[generator] Returning fallback response due to AI error');
		const fallbackMessage = `I encountered an issue generating a response, but here's what I found in the database:\n\n${context}\n\nBased on this information about ${query.toLowerCase()}.`;
		yield fallbackMessage;
	}
}


