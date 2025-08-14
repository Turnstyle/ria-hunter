import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function executeEnhancedQuery(plan: any) {
	const { filters, limit } = plan
	// Try fast RPC path; if it returns empty, fallback to direct SQL using aggregated fields
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
		const state = filters?.state || filters?.location || null
		let q = supabaseAdmin.from('ria_profiles')
			.select('crd_number, legal_name, city, state, private_fund_count, private_fund_aum')
			.gt('private_fund_count', 0)
		if (state) q = q.eq('state', state)
		const { data: rows, error } = await q.limit(limit || 10)
		if (error) throw error
		// Enrich with executives via a second query per firm (limit to small N)
		const results = await Promise.all((rows || []).map(async (r: any) => {
			const { data: execs } = await supabaseAdmin
				.from('control_persons')
				.select('name, title, adviser_id')
				.eq('adviser_id', Number(r.crd_number))
			const activity_score = (Number(r.private_fund_count || 0) * 0.6) + (Number(r.private_fund_aum || 0) / 1_000_000 * 0.4)
			return {
				crd_number: r.crd_number,
				legal_name: r.legal_name,
				city: r.city,
				state: r.state,
				vc_fund_count: r.private_fund_count || 0,
				vc_total_aum: r.private_fund_aum || 0,
				activity_score,
				executives: (execs || []).map((e: any) => ({ name: e.name, title: e.title })),
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


