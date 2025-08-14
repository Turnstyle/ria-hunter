import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function executeEnhancedQuery(plan: any) {
	const { filters, limit } = plan
	try {
		const { data, error } = await supabaseAdmin.rpc('compute_vc_activity', {
			// Order args to match function signature in DB (result_limit, state_filter)
			result_limit: limit || 10,
			state_filter: filters?.state || filters?.location || null,
		})
		if (error) throw error
		return data || []
	} catch (e) {
		console.error('executeEnhancedQuery error:', (e as any)?.message || e)
		return []
	}
}


