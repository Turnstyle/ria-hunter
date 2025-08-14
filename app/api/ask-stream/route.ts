import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from '@/app/api/ask/planner'
import { executeEnhancedQuery } from '@/app/api/ask/retriever'
import { buildAnswerContext } from '@/app/api/ask/context-builder'
import { streamAnswerTokens } from '@/app/api/ask/generator'

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

function corsHeaders(req: NextRequest): HeadersInit {
	const origin = getAllowedOriginFromRequest(req) || EFFECTIVE_ALLOWED_ORIGINS[0]
	return {
		'Access-Control-Allow-Origin': origin,
		'Vary': 'Origin',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	}
}

export function OPTIONS(req: NextRequest) {
	return new Response(null, { status: 204, headers: { ...corsHeaders(req), 'Access-Control-Max-Age': '86400' } })
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		if (!query) {
			return NextResponse.json({ error: 'Query is required' }, { status: 400, headers: corsHeaders(request) })
		}
		const plan = await callLLMToDecomposeQuery(query)
		const rows = await executeEnhancedQuery({ filters: { location: plan.structured_filters?.location }, limit: 10 })
		const context = buildAnswerContext(rows as any, query)
		const encoder = new TextEncoder()
		const sse = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					for await (const token of streamAnswerTokens(query, context)) {
						controller.enqueue(encoder.encode(`data: ${token}\n\n`))
					}
					controller.enqueue(encoder.encode('event: end\n\n'))
					controller.close()
				} catch (err) {
					controller.enqueue(encoder.encode(`event: error\n` + `data: ${(err as any)?.message || String(err)}\n\n`))
					controller.close()
				}
			},
		})
		return new Response(sse, {
			headers: {
				...corsHeaders(request),
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				'Connection': 'keep-alive',
				'X-Accel-Buffering': 'no',
			},
		})
	} catch (error) {
		console.error('Error in /api/ask-stream:', error)
		return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500, headers: corsHeaders(request) })
	}
}


