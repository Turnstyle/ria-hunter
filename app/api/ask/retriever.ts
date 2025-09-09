import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
				// Simple city filter - let the database handle variations naturally
				q = q.ilike('city', `%${city}%`)
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
			// Simple city filter - trust the database to handle it
			q = q.ilike('city', `%${city}%`)
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