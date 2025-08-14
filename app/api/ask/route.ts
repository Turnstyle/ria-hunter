import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from './planner'
import { executeEnhancedQuery } from './retriever'
import { buildAnswerContext } from './context-builder'
import { generateNaturalLanguageAnswer } from './generator'

const DEFAULT_ALLOWED_ORIGINS = [
	'https://www.ria-hunter.app',
	'https://ria-hunter.app',
]
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean)
const EFFECTIVE_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS

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

export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		if (!query) {
			return corsify(request, NextResponse.json({ error: 'Query is required' }, { status: 400 }))
		}
		const decomposedPlan = await callLLMToDecomposeQuery(query)
		const structuredData = await executeEnhancedQuery({ filters: { location: decomposedPlan.structured_filters?.location, state: decomposedPlan.structured_filters?.location }, limit: 10 })
		const context = buildAnswerContext(structuredData as any, query)
		const answer = await generateNaturalLanguageAnswer(query, context)

		return corsify(
			request,
			NextResponse.json({
				answer,
				sources: structuredData,
				metadata: { plan: decomposedPlan },
			}),
		)
	} catch (error) {
		console.error('Error in /api/ask:', error)
		return corsify(request, NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 }))
	}
}

