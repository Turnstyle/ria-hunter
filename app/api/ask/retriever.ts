import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function executeEnhancedQuery(plan: any) {
	const { filters, limit } = plan
	const { data, error } = await supabaseAdmin.rpc('compute_vc_activity', {
		state_filter: filters?.state || filters?.location || null,
		result_limit: limit || 10,
	})

	if (error) {
		console.error('Error fetching from Supabase RPC:', error)
		throw new Error('Database query failed.')
	}
	return data || []
}


