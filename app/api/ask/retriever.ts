import { supabaseAdmin } from '@/lib/supabaseAdmin'

// City variant generation for handling St. Louis and other city name variations
function generateCityVariants(rawCity?: string): string[] {
	if (!rawCity) return []
	const base = rawCity
		.replace(/\./g, '')
		.replace(/-/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	const t = base.toLowerCase()

	const variants = new Set<string>()

	// Base forms
	variants.add(titleCase(base))
	variants.add(base.toUpperCase())

	// Saint variants (St, St., Saint) with dotted and undotted forms
	if (/\bst\b|\bst\.|\bsaint\b/i.test(t)) {
		const saint = t.replace(/\bst\.?\s+/i, 'saint ').replace(/\bsaint\s+/i, 'saint ')
		const st = t.replace(/\bsaint\s+/i, 'st ').replace(/\bst\.?\s+/i, 'st ')
		// Explicit dotted shorthand (e.g., "St. Louis") to match DB entries that retain the period
		const stDot = t.replace(/\bsaint\s+/i, 'st. ').replace(/\bst\.?\s+/i, 'st. ')

		const saintTC = titleCase(saint)
		const stTC = titleCase(st)
		const stDotTC = titleCase(stDot)
		variants.add(saintTC)
		variants.add(stTC)
		variants.add(stDotTC)
		variants.add(saintTC.toUpperCase())
		variants.add(stTC.toUpperCase())
		variants.add(stDotTC.toUpperCase())
	}

	// Fort / Mount variants
	if (/\bft\b|\bft\.|\bfort\b/i.test(t)) {
		const fort = t.replace(/\bft\.?\s+/i, 'fort ')
		variants.add(titleCase(fort))
		variants.add(titleCase(fort).toUpperCase())
	}
	if (/\bmt\b|\bmt\.|\bmount\b/i.test(t)) {
		const mount = t.replace(/\bmt\.?\s+/i, 'mount ')
		variants.add(titleCase(mount))
		variants.add(titleCase(mount).toUpperCase())
	}

	// Super-loose: add punctuation-stripped and wildcard variants
	const tokenized = t.replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim()
	if (tokenized) {
		const compact = tokenized.replace(/\s+/g, '') // saintlouis
		variants.add(titleCase(compact))
		variants.add(compact.toUpperCase())
	}

	// Synonym expansions for common metros
	const synonyms: Record<string, string[]> = {
		'saint louis': ['st louis', 'st. louis', 'st-louis', 'stl', 'saintlouis'],
		'new york': ['new york city', 'nyc', 'newyork', 'new-york'],
	}
	const key = tokenized
	const matchKey = Object.keys(synonyms).find((k) => key.includes(k))
	if (matchKey) {
		for (const syn of synonyms[matchKey]) {
			const tc = titleCase(syn)
			variants.add(tc)
			variants.add(tc.toUpperCase())
		}
	}

	return Array.from(variants)
}

function titleCase(input: string): string {
	return input
		.toLowerCase()
		.split(' ')
		.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ')
}

export async function executeEnhancedQuery(plan: any) {
	const { filters, limit, semantic_query } = plan
	
	// Check if this is a "largest firms" query
	const isLargestQuery = semantic_query?.toLowerCase().includes('largest') || 
	                       semantic_query?.toLowerCase().includes('biggest') ||
	                       semantic_query?.toLowerCase().includes('top ria') ||
	                       semantic_query?.toLowerCase().includes('top investment advisor')
	
	if (isLargestQuery) {
		// Direct query for largest RIAs by total AUM
		try {
			const state = filters?.state || null
			const city = filters?.city || null
			let q = supabaseAdmin.from('ria_profiles')
				.select('crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum')
			
			if (state) q = q.eq('state', state)
			if (city) {
				// Handle St. Louis city variants
				const cityVariants = generateCityVariants(city)
				if (cityVariants.length === 1) {
					q = q.ilike('city', `%${cityVariants[0]}%`)
				} else if (cityVariants.length > 1) {
					const orConditions = cityVariants.map((cv) => `city.ilike.%${cv}%`).join(',')
					q = q.or(orConditions)
				}
			}
			
			q = q.order('aum', { ascending: false }).limit(limit || 10)
			const { data: rows, error } = await q
			
			if (!error && rows && rows.length > 0) {
				// Enrich with executives
				const results = await Promise.all(rows.map(async (r: any) => {
					let execs: any[] | null = null
					try {
						const res = await supabaseAdmin
							.from('control_persons')
							.select('person_name, title')
							.eq('crd_number', Number(r.crd_number))
						execs = res.data || []
					} catch {}
					
					return {
						crd_number: r.crd_number,
						legal_name: r.legal_name,
						city: r.city,
						state: r.state,
						aum: r.aum,
						total_aum: r.aum,
						activity_score: 0, // No activity score for largest queries
						executives: (execs || []).map((e: any) => ({ name: e.person_name, title: e.title })),
					}
				}))
				return results
			}
		} catch (e) {
			console.error('Largest firms query error:', (e as any)?.message || e)
		}
	}
	
	// Continue with existing VC-focused logic for non-"largest" queries
	try {
		const { data, error } = await supabaseAdmin.rpc('compute_vc_activity', {
			result_limit: limit || 10,
			state_filter: filters?.state || filters?.location || null,
		})
		if (!error && Array.isArray(data) && data.length > 0) return data
	} catch (e) {
		console.warn('RPC compute_vc_activity failed, falling back to direct query:', (e as any)?.message || e)
	}

	// Fallback query mirrors compute_vc_activity logic using ria_profiles and control_persons
	try {
		const state = filters?.state || null
		const city = filters?.city || null
		let q = supabaseAdmin.from('ria_profiles')
			.select('crd_number, legal_name, city, state, private_fund_count, private_fund_aum')
			.gt('private_fund_count', 0)
		if (state) q = q.eq('state', state)
		if (city) {
			// Handle St. Louis city variants for VC queries too
			const cityVariants = generateCityVariants(city)
			if (cityVariants.length === 1) {
				q = q.ilike('city', `%${cityVariants[0]}%`)
			} else if (cityVariants.length > 1) {
				const orConditions = cityVariants.map((cv) => `city.ilike.%${cv}%`).join(',')
				q = q.or(orConditions)
			}
		}
		const { data: rows, error } = await q.limit(limit || 10)
		if (error) throw error
		// Enrich with executives via a second query per firm (limit to small N)
		const results = await Promise.all((rows || []).map(async (r: any) => {
			let execs: any[] | null = null
			// Try by crd_number first
			try {
				const res = await supabaseAdmin
					.from('control_persons')
					.select('person_name, title')
					.eq('crd_number', Number(r.crd_number))
				execs = res.data || []
			} catch {}
			const activity_score = (Number(r.private_fund_count || 0) * 0.6) + (Number(r.private_fund_aum || 0) / 1_000_000 * 0.4)
			return {
				crd_number: r.crd_number,
				legal_name: r.legal_name,
				city: r.city,
				state: r.state,
				vc_fund_count: r.private_fund_count || 0,
				vc_total_aum: r.private_fund_aum || 0,
				activity_score,
				executives: (execs || []).map((e: any) => ({ name: e.person_name, title: e.title })),
			}
		}))
		// Order by computed score and slice to limit
		results.sort((a: any, b: any) => (b.activity_score || 0) - (a.activity_score || 0))
		return results.slice(0, limit || 10)
	} catch (e) {
		console.error('fallback executeEnhancedQuery error:', (e as any)?.message || e)
		return []
	}
}


