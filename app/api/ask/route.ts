import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
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
		const authHeader = request.headers.get('authorization')
		const userId = decodeJwtSub(authHeader)
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		if (!query) {
			return corsify(request, NextResponse.json({ error: 'Query is required' }, { status: 400 }))
		}

		// Credits enforcement (subscriber/unlimited or free-tier)
		let needsCookieUpdate = false
		let anonCount = 0
		if (userId) {
			const limit = await checkQueryLimit(userId)
			if (!limit.allowed) {
				return corsify(
					request,
					NextResponse.json(
						{
							error: limit.isSubscriber
								? 'Subscription expired. Please renew your subscription to continue.'
								: 'Free query limit reached. Upgrade to continue.',
							code: 'PAYMENT_REQUIRED',
							remaining: limit.remaining,
							isSubscriber: limit.isSubscriber,
							upgradeRequired: true,
						},
						{ status: 402 },
					),
				)
			}
		} else {
			const anon = parseAnonCookie(request)
			anonCount = anon.count
			if (anonCount >= 2) {
				return corsify(
					request,
					NextResponse.json(
						{
							error: 'Free query limit reached. Create an account for more searches.',
							code: 'PAYMENT_REQUIRED',
							remaining: 0,
							isSubscriber: false,
							upgradeRequired: true,
						},
						{ status: 402 },
					),
				)
			}
			needsCookieUpdate = true
		}

		const decomposedPlan = await callLLMToDecomposeQuery(query)
		// Parse location like "City, ST" into discrete parts
		let city: string | undefined
		let state: string | undefined
		const loc = decomposedPlan.structured_filters?.location || ''
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
		let relaxationLevel: 'state' | null = null
		let structuredData = await executeEnhancedQuery({ filters: { state, city, min_aum: decomposedPlan.structured_filters?.min_aum || null }, limit: 10 })
		if (Array.isArray(structuredData) && structuredData.length === 0 && state && city) {
			// Relax to state-only when city filter yields no results
			structuredData = await executeEnhancedQuery({ filters: { state, city: undefined, min_aum: decomposedPlan.structured_filters?.min_aum || null }, limit: 10 })
			if (Array.isArray(structuredData) && structuredData.length > 0) relaxationLevel = 'state'
		}
		const context = buildAnswerContext(structuredData as any, query)
		const answer = await generateNaturalLanguageAnswer(query, context)

		// Log usage for authenticated users
		if (userId) {
			await logQueryUsage(userId)
		}

		let response = corsify(
			request,
			NextResponse.json({
				answer,
				sources: structuredData,
				insufficient_data: !structuredData || (Array.isArray(structuredData) && structuredData.length === 0),
				metadata: {
					plan: decomposedPlan,
					debug: { provider: process.env.AI_PROVIDER || 'openai', openaiKeyPresent: !!process.env.OPENAI_API_KEY },
					remaining: userId ? -1 : Math.max(0, 2 - (anonCount + 1)),
					relaxed: relaxationLevel !== null,
					relaxationLevel,
				},
			}),
		)
		if (!userId && needsCookieUpdate) {
			response = withAnonCookie(response, anonCount + 1)
		}
		return response
	} catch (error) {
		console.error('Error in /api/ask:', error)
		return corsify(
			request,
			NextResponse.json({ error: 'An internal error occurred.', debug: { message: (error as any)?.message || String(error) } }, { status: 500 }),
		)
	}
}

// Helpers copied from v1 route so /api/ask is credit-aware
function decodeJwtSub(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null
	const parts = authorizationHeader.split(' ')
	if (parts.length !== 2 || parts[0] !== 'Bearer') return null
	const token = parts[1]
	const segments = token.split('.')
	if (segments.length < 2) return null
	try {
		const payload = JSON.parse(Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
		return payload?.sub || null
	} catch {
		return null
	}
}

async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }> {
	const startOfMonth = new Date()
	startOfMonth.setDate(1)
	startOfMonth.setHours(0, 0, 0, 0)
	try {
		const { data: subscription } = await supabaseAdmin
			.from('subscriptions')
			.select('status')
			.eq('user_id', userId)
			.single()
		const isSubscriber = !!(subscription && ['trialing', 'active'].includes(subscription.status))
		if (isSubscriber) return { allowed: true, remaining: -1, isSubscriber: true }
		const [{ count: queryCount }, { count: shareCount }] = await Promise.all([
			supabaseAdmin
				.from('user_queries')
				.select('*', { head: true, count: 'exact' })
				.eq('user_id', userId)
				.gte('created_at', startOfMonth.toISOString()),
			supabaseAdmin
				.from('user_shares')
				.select('*', { head: true, count: 'exact' })
				.eq('user_id', userId)
				.gte('shared_at', startOfMonth.toISOString()),
		])
		const allowedQueries = 2 + Math.min(shareCount || 0, 1)
		const currentQueries = queryCount || 0
		const remaining = Math.max(0, allowedQueries - currentQueries)
		return { allowed: currentQueries < allowedQueries, remaining, isSubscriber: false }
	} catch (error) {
		console.error('Error checking query limit:', error)
		return { allowed: true, remaining: 0, isSubscriber: false }
	}
}

async function logQueryUsage(userId: string): Promise<void> {
	try {
		await supabaseAdmin.from('user_queries').insert({ user_id: userId })
	} catch (error) {
		console.error('Error logging query usage:', error)
	}
}

function parseAnonCookie(req: NextRequest): { count: number } {
	const cookie = req.cookies.get('rh_qc')?.value
	const count = cookie ? Number(cookie) || 0 : 0
	return { count }
}

function withAnonCookie(res: Response, newCount: number): Response {
	const headers = new Headers(res.headers)
	headers.append('Set-Cookie', `rh_qc=${newCount}; Path=/; Max-Age=2592000; SameSite=Lax`)
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

