import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callLLMToDecomposeQuery } from './planner'
import { executeEnhancedQuery } from './retriever'
import { buildAnswerContext } from './context-builder'
import { generateNaturalLanguageAnswer } from './generator'
import { CREDITS_CONFIG } from '@/app/config/credits'
import { corsHeaders, handleOptionsRequest, addCorsHeaders, corsError } from '@/lib/cors'

// Use the centralized CORS implementation for OPTIONS
export function OPTIONS(req: NextRequest) {
	return handleOptionsRequest(req)
}

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const userId = decodeJwtSub(authHeader)
		const body = await request.json().catch(() => ({} as any))
		const query = typeof body?.query === 'string' ? body.query : ''
		if (!query) {
			return corsError(request, 'Query is required', 400)
		}

		// Credits enforcement (subscriber/unlimited or free-tier)
		let needsCookieUpdate = false
		let anonCount = 0
		if (userId) {
			const limit = await checkQueryLimit(userId)
			if (!limit.allowed) {
				return new Response(
					JSON.stringify({
						error: limit.isSubscriber
							? 'Subscription expired. Please renew your subscription to continue.'
							: 'Free query limit reached. Upgrade to continue.',
						code: 'PAYMENT_REQUIRED',
						remaining: limit.remaining,
						isSubscriber: limit.isSubscriber,
						upgradeRequired: true,
					}),
					{ 
						status: 402, 
						headers: {
							...corsHeaders(request),
							'Content-Type': 'application/json'
						} 
					}
				)
			}
		} else {
			const anon = parseAnonCookie(request)
			anonCount = anon.count
			if (anonCount >= CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS) {
				return new Response(
					JSON.stringify({
						error: CREDITS_CONFIG.MESSAGES.CREDITS_EXHAUSTED_ANONYMOUS,
						code: 'PAYMENT_REQUIRED',
						remaining: 0,
						isSubscriber: false,
						upgradeRequired: true,
					}),
					{ 
						status: 402, 
						headers: {
							...corsHeaders(request),
							'Content-Type': 'application/json'
						} 
					}
				)
			}
			needsCookieUpdate = true
		}

		const decomposedPlan = await callLLMToDecomposeQuery(query)
		// Parse location robustly: accept "City, ST", "ST", full state names like "Missouri"
		function normalizeStateNameToCode(input?: string): string | undefined {
			if (!input) return undefined
			const s = input.trim()
			if (s.length === 2) return s.toUpperCase()
			const map: Record<string, string> = {
				Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
				Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
				Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
				Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
				Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
				'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
				'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
				Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
				Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
				'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
			}
			return map[s] || undefined
		}

		let city: string | undefined
		let state: string | undefined
		const loc = decomposedPlan.structured_filters?.location || ''
		if (typeof loc === 'string' && loc.length > 0) {
			const parts = loc.split(',').map((p) => p.trim()).filter(Boolean)
			if (parts.length === 2) {
				city = parts[0]
				state = normalizeStateNameToCode(parts[1]) || parts[1].toUpperCase()
			} else if (parts.length === 1) {
				const maybeState = normalizeStateNameToCode(parts[0])
				if (maybeState) state = maybeState
				else city = parts[0]
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

		// Create response with proper CORS headers
		const headers = corsHeaders(request);
		headers.set('Content-Type', 'application/json');
		
		let response = new Response(
			JSON.stringify({
				answer,
				sources: structuredData,
				insufficient_data: !structuredData || (Array.isArray(structuredData) && structuredData.length === 0),
				metadata: {
					plan: decomposedPlan,
					debug: { provider: process.env.AI_PROVIDER || 'openai', openaiKeyPresent: !!process.env.OPENAI_API_KEY },
					remaining: userId ? -1 : Math.max(0, CREDITS_CONFIG.ANONYMOUS_FREE_CREDITS - (anonCount + 1)),
					relaxed: relaxationLevel !== null,
					relaxationLevel,
				},
			}),
			{ status: 200, headers }
		)
		if (!userId && needsCookieUpdate) {
			response = withAnonCookie(response, anonCount + 1)
		}
		return response
	} catch (error) {
		console.error('Error in /api/ask:', error)
		return new Response(
			JSON.stringify({ 
				error: 'An internal error occurred.', 
				debug: { message: (error as any)?.message || String(error) } 
			}),
			{ 
				status: 500, 
				headers: {
					...corsHeaders(request),
					'Content-Type': 'application/json'
				} 
			}
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
		const allowedQueries = CREDITS_CONFIG.FREE_USER_MONTHLY_CREDITS + Math.min(shareCount || 0, CREDITS_CONFIG.FREE_USER_SHARE_BONUS_MAX)
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

