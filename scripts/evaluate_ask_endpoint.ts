/*
  Evaluation script: runs a golden set of queries against /api/ask and uses OpenAI to judge faithfulness and relevance.
  Usage: ts-node scripts/evaluate_ask_endpoint.ts
*/
import OpenAI from 'openai'

const BASE_URL = process.env.RH_API_BASE_URL || 'http://localhost:3000'

const QUERIES = [
	'What are the top 5 RIAs in Saint Louis with private placements?',
	'Who are the most active venture-focused RIAs in California?',
	'Largest RIA in Missouri by AUM',
	'RIAs in New York with over $5 billion AUM',
]

async function callAsk(query: string) {
	const res = await fetch(`${BASE_URL}/api/ask`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query }),
	})
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	return (await res.json()) as any
}

async function judge(openai: OpenAI, query: string, answer: string, sources: any) {
	const prompt = `You are grading an answer for faithfulness and relevance.

USER QUESTION:
${query}

SYSTEM ANSWER:
${answer}

STRUCTURED SOURCES (JSON):
${JSON.stringify(sources).slice(0, 5000)}

Evaluate:
- Faithfulness (0-1): Does the answer align with facts present in sources?
- Relevance (0-1): Does it directly address the question?
- Notes: Short explanation.

Return EXACT JSON with keys: { "faithfulness": number, "relevance": number, "notes": string }`;

	const comp = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{ role: 'system', content: 'Return only valid JSON.' },
			{ role: 'user', content: prompt },
		],
		temperature: 0,
	})
	const raw = comp.choices[0]?.message?.content?.trim() || '{}'
	try { return JSON.parse(raw) } catch { return { faithfulness: 0, relevance: 0, notes: 'Parse error' } }
}

async function main() {
	const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
	const results: any[] = []
	for (const q of QUERIES) {
		try {
			const resp = await callAsk(q)
			const judgment = await judge(openai, q, resp.answer || '', resp.sources || [])
			results.push({ q, ...judgment })
			console.log(`✓ ${q} => F:${judgment.faithfulness} R:${judgment.relevance}`)
		} catch (e: any) {
			results.push({ q, error: e.message })
			console.log(`✗ ${q} => ${e.message}`)
		}
	}
	const avgF = (results.filter(r => r.faithfulness !== undefined).reduce((s, r) => s + (r.faithfulness || 0), 0) / Math.max(1, results.length)).toFixed(2)
	const avgR = (results.filter(r => r.relevance !== undefined).reduce((s, r) => s + (r.relevance || 0), 0) / Math.max(1, results.length)).toFixed(2)
	console.log('\nSummary:', { avgFaithfulness: avgF, avgRelevance: avgR })
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})


