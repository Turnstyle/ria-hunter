const STATE_ABBREVIATIONS: Record<string, string> = {
	alabama: 'AL',
	alaska: 'AK',
	arizona: 'AZ',
	arkansas: 'AR',
	california: 'CA',
	colorado: 'CO',
	connecticut: 'CT',
	delaware: 'DE',
	'district of columbia': 'DC',
	florida: 'FL',
	georgia: 'GA',
	hawaii: 'HI',
	idaho: 'ID',
	illinois: 'IL',
	indiana: 'IN',
	iowa: 'IA',
	kansas: 'KS',
	kentucky: 'KY',
	louisiana: 'LA',
	maine: 'ME',
	maryland: 'MD',
	massachusetts: 'MA',
	michigan: 'MI',
	minnesota: 'MN',
	mississippi: 'MS',
	missouri: 'MO',
	montana: 'MT',
	nebraska: 'NE',
	nevada: 'NV',
	'new hampshire': 'NH',
	'new jersey': 'NJ',
	'new mexico': 'NM',
	'new york': 'NY',
	'north carolina': 'NC',
	'north dakota': 'ND',
	ohio: 'OH',
	oklahoma: 'OK',
	oregon: 'OR',
	pennsylvania: 'PA',
	'puerto rico': 'PR',
	'rhode island': 'RI',
	'south carolina': 'SC',
	'south dakota': 'SD',
	tennessee: 'TN',
	texas: 'TX',
	utah: 'UT',
	vermont: 'VT',
	virginia: 'VA',
	washington: 'WA',
	'west virginia': 'WV',
	wisconsin: 'WI',
	wyoming: 'WY'
}

export function normalizeStateInput(value?: string | null): string | null {
	if (!value) return null
	const trimmed = value.trim()
	if (!trimmed) return null

	// Already a two-letter code
	if (/^[A-Za-z]{2}$/.test(trimmed)) {
		return trimmed.toUpperCase()
	}

	const normalizedKey = trimmed.replace(/\./g, '').toLowerCase()
	const abbreviation = STATE_ABBREVIATIONS[normalizedKey]
	return abbreviation ? abbreviation : null
}

export function normalizeCityInput(value?: string | null): string | null {
	if (!value) return null
	const trimmed = value.trim()
	if (!trimmed) return null
	return trimmed
}

export function createCityPattern(value?: string | null): string | null {
	const normalized = normalizeCityInput(value)
	if (!normalized) return null

	const base = normalized
		.replace(/\./g, ' ')
		.replace(/\bsaint\b/gi, 'st')
		.replace(/[^A-Za-z\s]/g, ' ')
		.toLowerCase()
		.trim()

	if (!base) return null

	const tokens = base.split(/\s+/).filter(Boolean)
	if (tokens.length === 0) return null

	return `%${tokens.join('%')}%`
}

export function cityMatchesFilter(cityValue: string | null | undefined, filterValue: string | null | undefined): boolean {
	if (!filterValue) return true

	const normalize = (input: string) =>
		input
			.replace(/\./g, ' ')
			.replace(/\bsaint\b/gi, 'st')
			.replace(/[^a-z\s]/gi, ' ')
			.toLowerCase()
			.trim()

	const normalizedCity = normalize(cityValue || '')
	const normalizedFilter = normalize(filterValue || '')

	if (!normalizedFilter) return true
	return normalizedCity.includes(normalizedFilter)
}
