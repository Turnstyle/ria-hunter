import { NextResponse, type NextRequest } from 'next/server'
import { callLLMToDecomposeQuery } from '@/app/api/ask/planner'
import { executeEnhancedQuery } from '@/app/api/ask/retriever'
import { buildAnswerContext } from '@/app/api/ask/context-builder'
import { streamAnswerTokens } from '@/app/api/ask/generator'
import { CREDITS_CONFIG } from '@/app/config/credits'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.ria-hunter.app',
  'https://ria-hunter.app',
  'https://ria-hunter-app.vercel.app',
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

// Helper function to parse anonymous cookie
function parseAnonCookie(req: NextRequest): { count: number } {
  try {
    const cookie = req.cookies.get(CREDITS_CONFIG.ANONYMOUS_COOKIE_NAME);
    if (cookie?.value) {
      const parsed = JSON.parse(cookie.value);
      return { count: Number(parsed.count) || 0 };
    }
  } catch {}
  return { count: 0 };
}

// Function to add anon cookie to response
function withAnonCookie(res: Response, newCount: number): Response {
  const headers = new Headers(res.headers);
  headers.set(
    'Set-Cookie', 
    `${CREDITS_CONFIG.ANONYMOUS_COOKIE_NAME}=${JSON.stringify({ count: newCount })};path=/;max-age=${CREDITS_CONFIG.ANONYMOUS_COOKIE_MAX_AGE}`
  );
  return new Response(res.body, { 
    status: res.status, 
    statusText: res.statusText, 
    headers 
  });
}

export async function POST(request: NextRequest) {
	// Add request logging for debugging
	const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	const method = request.method;
	const url = request.url;
	const headers = Object.fromEntries(request.headers.entries());
	  
	console.log(`[${requestId}] Incoming request:`, {
		method,
		url,
		headers: {
			'content-type': headers['content-type'],
			'accept': headers['accept'],
			'authorization': headers['authorization'] ? 'Bearer ***' : 'none'
		}
	});

	try {
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		if (!query) {
			return NextResponse.json({ error: 'Query is required' }, { status: 400, headers: corsHeaders(request) })
		}
		
		// Get user authentication if available
		const userId = request.headers.get('x-user-id');
		const isAuthenticated = !!userId;
		
		// Check credits for anonymous users
		if (!isAuthenticated) {
			const anonCookie = parseAnonCookie(request);
			if (anonCookie.count >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {
				return NextResponse.json(
					{
						error: CREDITS_CONFIG.MESSAGES.CREDITS_EXHAUSTED_ANONYMOUS,
						code: 'PAYMENT_REQUIRED',
						remaining: 0,
						isSubscriber: false,
						upgradeRequired: true
					},
					{ status: 402, headers: corsHeaders(request) }
				);
			}
		}
		const plan = await callLLMToDecomposeQuery(query)
		let city: string | undefined
		let state: string | undefined
		const loc = plan.structured_filters?.location || ''
		if (typeof loc === 'string' && loc.length > 0) {
			const parts = loc.split(',').map((p) => p.trim())
			if (parts.length === 2) {
				city = parts[0]
				state = parts[1].toUpperCase()
			} else if (parts.length === 1 && parts[0].length === 2) {
				state = parts[0].toUpperCase()
			} else {
				city = parts[0]
			}
		}
		const rows = await executeEnhancedQuery({ filters: { state, city }, limit: 10 })
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
		
		// Create the response with stream
		const response = new Response(sse, {
			headers: {
				...corsHeaders(request),
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				'Connection': 'keep-alive',
				'X-Accel-Buffering': 'no',
			},
		})
		
		// If anonymous user, increment count and update cookie
		if (!isAuthenticated) {
			const anonCookie = parseAnonCookie(request);
			const newCount = anonCookie.count + 1;
			return withAnonCookie(response, newCount);
		}
		
		return response
	} catch (error) {
		console.error('Error in /api/ask-stream:', error)
		return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500, headers: corsHeaders(request) })
	}
}


