import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function executeEnhancedQuery(plan: any) {
	const { filters, limit } = plan
	try {
		const { data, error } = await supabaseAdmin.rpc('compute_vc_activity', {
			state_filter: filters?.state || filters?.location || null,
			result_limit: limit || 10,
		})
		if (error) throw error
		return data || []
	} catch (e) {
		console.error('executeEnhancedQuery error:', (e as any)?.message || e)
		return []
	}
}


