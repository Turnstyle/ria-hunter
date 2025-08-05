/**
 * US State mappings and utilities for query parsing
 */

export interface StateInfo {
  name: string;
  abbreviation: string;
}

// Complete mapping of US states
export const US_STATES: StateInfo[] = [
  { name: 'alabama', abbreviation: 'AL' },
  { name: 'alaska', abbreviation: 'AK' },
  { name: 'arizona', abbreviation: 'AZ' },
  { name: 'arkansas', abbreviation: 'AR' },
  { name: 'california', abbreviation: 'CA' },
  { name: 'colorado', abbreviation: 'CO' },
  { name: 'connecticut', abbreviation: 'CT' },
  { name: 'delaware', abbreviation: 'DE' },
  { name: 'florida', abbreviation: 'FL' },
  { name: 'georgia', abbreviation: 'GA' },
  { name: 'hawaii', abbreviation: 'HI' },
  { name: 'idaho', abbreviation: 'ID' },
  { name: 'illinois', abbreviation: 'IL' },
  { name: 'indiana', abbreviation: 'IN' },
  { name: 'iowa', abbreviation: 'IA' },
  { name: 'kansas', abbreviation: 'KS' },
  { name: 'kentucky', abbreviation: 'KY' },
  { name: 'louisiana', abbreviation: 'LA' },
  { name: 'maine', abbreviation: 'ME' },
  { name: 'maryland', abbreviation: 'MD' },
  { name: 'massachusetts', abbreviation: 'MA' },
  { name: 'michigan', abbreviation: 'MI' },
  { name: 'minnesota', abbreviation: 'MN' },
  { name: 'mississippi', abbreviation: 'MS' },
  { name: 'missouri', abbreviation: 'MO' },
  { name: 'montana', abbreviation: 'MT' },
  { name: 'nebraska', abbreviation: 'NE' },
  { name: 'nevada', abbreviation: 'NV' },
  { name: 'new hampshire', abbreviation: 'NH' },
  { name: 'new jersey', abbreviation: 'NJ' },
  { name: 'new mexico', abbreviation: 'NM' },
  { name: 'new york', abbreviation: 'NY' },
  { name: 'north carolina', abbreviation: 'NC' },
  { name: 'north dakota', abbreviation: 'ND' },
  { name: 'ohio', abbreviation: 'OH' },
  { name: 'oklahoma', abbreviation: 'OK' },
  { name: 'oregon', abbreviation: 'OR' },
  { name: 'pennsylvania', abbreviation: 'PA' },
  { name: 'rhode island', abbreviation: 'RI' },
  { name: 'south carolina', abbreviation: 'SC' },
  { name: 'south dakota', abbreviation: 'SD' },
  { name: 'tennessee', abbreviation: 'TN' },
  { name: 'texas', abbreviation: 'TX' },
  { name: 'utah', abbreviation: 'UT' },
  { name: 'vermont', abbreviation: 'VT' },
  { name: 'virginia', abbreviation: 'VA' },
  { name: 'washington', abbreviation: 'WA' },
  { name: 'west virginia', abbreviation: 'WV' },
  { name: 'wisconsin', abbreviation: 'WI' },
  { name: 'wyoming', abbreviation: 'WY' },
  { name: 'district of columbia', abbreviation: 'DC' }
];

// Create reverse mapping for quick lookups
const stateByAbbreviation = new Map(
  US_STATES.map(state => [state.abbreviation, state])
);

const stateByName = new Map(
  US_STATES.map(state => [state.name, state])
);

/**
 * Extract state from a query string
 * @param query The user's query
 * @returns The state abbreviation if found, null otherwise
 */
export function extractStateFromQuery(query: string): string | null {
  const queryLower = query.toLowerCase();
  
  // First, check for state abbreviations (with word boundaries)
  // Skip common words that might be state abbreviations
  const skipWords = new Set(['in', 'or', 'me', 'ok']); // These are also state codes
  
  for (const state of US_STATES) {
    // For problematic abbreviations, require more context
    if (skipWords.has(state.abbreviation.toLowerCase())) {
      // Look for patterns like "in IN" or ", IN" or "IN " (followed by number/zip)
      const contextPattern = new RegExp(`(?:,\\s*|\\bin\\s+)${state.abbreviation}\\b|\\b${state.abbreviation}\\s+\\d{5}`, 'i');
      if (contextPattern.test(query)) {
        return state.abbreviation;
      }
    } else {
      const abbrevPattern = new RegExp(`\\b${state.abbreviation}\\b`, 'i');
      if (abbrevPattern.test(query)) {
        return state.abbreviation;
      }
    }
  }
  
  // Then check for full state names
  for (const state of US_STATES) {
    if (queryLower.includes(state.name)) {
      return state.abbreviation;
    }
  }
  
  // Check for patterns like "in Missouri", "from Texas", etc.
  const locationPatterns = [
    /\b(?:in|from|near|at|based in|located in|headquartered in)\s+([a-z\s]+)/gi
  ];
  
  for (const pattern of locationPatterns) {
    const matches = queryLower.matchAll(pattern);
    for (const match of matches) {
      const location = match[1].trim();
      
      // Check if it's a state name
      const stateInfo = stateByName.get(location);
      if (stateInfo) {
        return stateInfo.abbreviation;
      }
      
      // Check if it's a state abbreviation
      const upperLocation = location.toUpperCase();
      if (stateByAbbreviation.has(upperLocation)) {
        return upperLocation;
      }
    }
  }
  
  return null;
}

/**
 * Check if query contains superlative terms
 */
export function hasSuperlative(query: string): boolean {
  const superlatives = [
    'largest', 'biggest', 'top', 'smallest', 'highest', 'most', 'best',
    'leading', 'premier', 'major', 'greatest'
  ];
  const queryLower = query.toLowerCase();
  return superlatives.some(term => queryLower.includes(term));
}

/**
 * Check if query is asking for a count
 */
export function isCountQuery(query: string): boolean {
  const countPatterns = [
    /how many/i,
    /\bcount\b/i,
    /\bnumber of\b/i,
    /\btotal\b/i
  ];
  return countPatterns.some(pattern => pattern.test(query));
}

/**
 * Extract firm name from query
 */
export function extractFirmName(query: string): string | null {
  // Look for quoted firm names
  const quotedMatch = query.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    return quotedMatch[1];
  }
  
  // Look for patterns like "about XYZ Advisors" or "tell me about XYZ"
  const aboutPattern = /(?:about|regarding|for)\s+([A-Z][A-Za-z\s&,.\-]+(?:advisors?|wealth|capital|management|partners?|group|llc|inc|corp))/i;
  const match = query.match(aboutPattern);
  if (match) {
    return match[1].trim();
  }
  
  return null;
}