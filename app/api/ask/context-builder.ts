type ActivityRow = {
	crd_number: number
	legal_name: string
	city: string
	state: string
	vc_fund_count: number
	vc_total_aum: number
	activity_score: number
	executives: Array<{ name: string; title: string }>
}

export function buildAnswerContext(rows: ActivityRow[], originalQuery: string): string {
	const header = `User query: ${originalQuery}\n\nThe following dataset lists RIAs most active in venture/private funds.`
	const lines: string[] = []
	for (let i = 0; i < Math.min(rows.length, 25); i++) {
		const r = rows[i]
		const execs = Array.isArray(r.executives)
			? r.executives
				.filter((e) => e && (e.name || e.title))
				.slice(0, 5)
				.map((e) => `${e.name || 'N/A'}${e.title ? ` (${e.title})` : ''}`)
				.join('; ')
			: ''
		lines.push(
			`${i + 1}. ${r.legal_name} — ${r.city}, ${r.state} | VC funds: ${Number(r.vc_fund_count) || 0} | VC AUM: $${Number(r.vc_total_aum || 0).toLocaleString()} | Score: ${Number(r.activity_score || 0).toFixed(2)}${execs ? ` | Executives: ${execs}` : ''}`,
		)
	}
	return [header, '', ...lines].join('\n')
}


