type ActivityRow = {
	crd_number: number
	legal_name: string
	city: string
	state: string
	aum?: number  // Total assets under management
	private_fund_count?: number  // Number of private funds
	private_fund_aum?: number  // Private fund AUM
	vc_fund_count?: number  // Legacy field for backward compatibility
	vc_total_aum?: number  // Legacy field for backward compatibility
	activity_score?: number
	similarity?: number  // Semantic search similarity score
	executives: Array<{ name?: string; title?: string }>
	private_funds?: Array<{
		fund_name?: string
		fund_type?: string
		gross_asset_value?: number
		created_at?: string
	}>
	// Note: Full street addresses are not currently stored in the database
	// Only city and state are available
}

export function buildAnswerContext(rows: ActivityRow[], originalQuery: string): string {
	// Dynamic header based on query content
	const isVentureQuery = originalQuery.toLowerCase().includes('venture') || 
	                      originalQuery.toLowerCase().includes('vc')
	const wantsAddress = originalQuery.toLowerCase().includes('address')
	const wantsPrivateFundActivity = originalQuery.toLowerCase().includes('private fund') || 
	                                 originalQuery.toLowerCase().includes('fund activity')
	
	const header = isVentureQuery 
		? `User query: ${originalQuery}\n\nThe following dataset lists RIAs most active in venture/private funds.`
		: `User query: ${originalQuery}\n\nThe following are Registered Investment Advisors (RIAs) matching your query:`
	
	// Add notice if address data was requested but isn't available
	let addressNotice = ''
	if (wantsAddress) {
		addressNotice = '\n\nNote: Full street addresses are not currently available in the database. Only city and state information is provided.'
	}
	
	const lines: string[] = []
	for (let i = 0; i < Math.min(rows.length, 25); i++) {
		const r = rows[i]
		
		// Get executives list
		const execs = Array.isArray(r.executives)
			? r.executives
				.filter((e) => e && ((e as any).name || e.title))
				.slice(0, 5)
				.map((e: any) => `${e.name || 'N/A'}${e.title ? ` (${e.title})` : ''}`)
				.join('; ')
			: ''
		
		// Build description with available fields, prioritizing actual data over legacy fields
		const parts: string[] = [
			`${i + 1}. ${r.legal_name}`
		]
		
		// Add location (this is the only "address" data we have)
		parts.push(`Location: ${r.city}, ${r.state}`)
		
		// Add AUM information if available
		if (r.aum && r.aum > 0) {
			parts.push(`Total AUM: $${Number(r.aum).toLocaleString()}`)
		} else if (r.vc_total_aum && r.vc_total_aum > 0) {
			// Fall back to legacy field if present
			parts.push(`VC AUM: $${Number(r.vc_total_aum).toLocaleString()}`)
		}
		
		// Add private fund information if available
		if (r.private_fund_count && r.private_fund_count > 0) {
			parts.push(`Private Funds: ${r.private_fund_count}`)
			if (r.private_fund_aum && r.private_fund_aum > 0) {
				parts.push(`Private Fund AUM: $${Number(r.private_fund_aum).toLocaleString()}`)
			}
		} else if (r.vc_fund_count && r.vc_fund_count > 0) {
			// Fall back to legacy fields
			parts.push(`VC funds: ${r.vc_fund_count}`)
		}
		
		// Add specific private fund details if available and requested
		if (wantsPrivateFundActivity && r.private_funds && r.private_funds.length > 0) {
			const recentFunds = r.private_funds
				.slice(0, 3)  // Show up to 3 recent funds
				.map(f => `${f.fund_name || 'Unnamed Fund'} (${f.fund_type || 'Type N/A'}, $${(f.gross_asset_value || 0).toLocaleString()})`)
				.join('; ')
			parts.push(`Recent Funds: ${recentFunds}`)
		}
		
		// Add similarity score for semantic search results
		if (r.similarity && r.similarity > 0) {
			parts.push(`Relevance: ${(r.similarity * 100).toFixed(1)}%`)
		} else if (r.activity_score && r.activity_score > 0) {
			parts.push(`Score: ${Number(r.activity_score).toFixed(2)}`)
		}
		
		// Add executives if available
		if (execs) {
			parts.push(`Executives: ${execs}`)
		}
		
		lines.push(parts.join(' | '))
	}
	
	return [header, addressNotice, '', ...lines].join('\n')
}


