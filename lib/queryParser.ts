/**
 * Query parsing utilities for natural language processing
 */

import { extractStateFromQuery, hasSuperlative, isCountQuery, extractFirmName } from './states';

/**
 * Extract city from a query string
 * @param query The user's query
 * @returns The city name if found, null otherwise
 */
export function extractCityFromQuery(query: string): string | null {
  const queryLower = query.toLowerCase();
  
  // Common US cities that might be mentioned in RIA queries
  const cities = [
    'st. louis', 'saint louis', 'st louis',
    'new york', 'chicago', 'los angeles', 'houston', 'philadelphia', 
    'phoenix', 'san antonio', 'san diego', 'dallas', 'san jose', 'austin',
    'jacksonville', 'fort worth', 'columbus', 'charlotte', 'san francisco',
    'indianapolis', 'seattle', 'denver', 'washington', 'boston', 'el paso',
    'detroit', 'nashville', 'memphis', 'portland', 'oklahoma city', 'las vegas',
    'louisville', 'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno',
    'mesa', 'sacramento', 'atlanta', 'kansas city', 'colorado springs',
    'raleigh', 'omaha', 'miami', 'oakland', 'tulsa', 'minneapolis', 'cleveland',
    'wichita', 'arlington', 'bakersfield', 'new orleans', 'honolulu', 'anaheim',
    'tampa', 'aurora', 'santa ana', 'saint paul', 'cincinnati', 'pittsburgh',
    'henderson', 'stockton', 'corpus christi', 'lexington', 'anchorage',
    'riverside', 'spokane', 'toledo', 'st. petersburg', 'newark', 'greensboro'
  ];
  
  // Look for city names in the query
  for (const city of cities) {
    if (queryLower.includes(city)) {
      // Return the properly formatted city name
      if (city.includes('st.') || city.includes('saint')) {
        return 'ST. LOUIS'; // Standardize St. Louis variants
      }
      return city.toUpperCase();
    }
  }
  
  // Check for patterns like "in [City]" or "from [City]"
  const locationPatterns = [
    /\b(?:in|from|near|at|based in|located in|headquartered in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
  ];
  
  for (const pattern of locationPatterns) {
    const matches = query.matchAll(pattern);
    for (const match of matches) {
      const potentialCity = match[1].toLowerCase();
      if (cities.includes(potentialCity)) {
        if (potentialCity.includes('st.') || potentialCity.includes('saint')) {
          return 'ST. LOUIS';
        }
        return potentialCity.toUpperCase();
      }
    }
  }
  
  return null;
}

export interface ParsedQuery {
  originalQuery: string;
  queryType: 'search' | 'count' | 'specific' | 'superlative';
  filters: {
    state?: string;
    city?: string;
    firmName?: string;
    hasSuperlative?: boolean;
    superlativeType?: 'largest' | 'smallest' | 'top';
    limit?: number;
  };
  searchTerms: string[];
  intent: string;
}

/**
 * Parse a natural language query to extract structured information
 */
export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    originalQuery: query,
    queryType: 'search',
    filters: {},
    searchTerms: [],
    intent: 'general'
  };

  // Extract state
  const state = extractStateFromQuery(query);
  if (state) {
    result.filters.state = state;
  }

  // Extract city
  const city = extractCityFromQuery(query);
  if (city) {
    result.filters.city = city;
  }

  // Check for count queries
  if (isCountQuery(query)) {
    result.queryType = 'count';
    result.intent = 'count';
  }

  // Check for superlatives
  if (hasSuperlative(query)) {
    result.queryType = 'superlative';
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('largest') || queryLower.includes('biggest')) {
      result.filters.superlativeType = 'largest';
      result.filters.hasSuperlative = true;
      result.intent = 'find_largest';
    } else if (queryLower.includes('smallest')) {
      result.filters.superlativeType = 'smallest';
      result.filters.hasSuperlative = true;
      result.intent = 'find_smallest';
    } else if (queryLower.includes('top')) {
      result.filters.superlativeType = 'top';
      result.filters.hasSuperlative = true;
      // Extract number for "top N"
      const topMatch = queryLower.match(/top\s+(\d+)/);
      if (topMatch) {
        result.filters.limit = parseInt(topMatch[1], 10);
      } else {
        result.filters.limit = 5; // Default to top 5
      }
      result.intent = 'find_top';
    }
  }

  // Extract firm name
  const firmName = extractFirmName(query);
  if (firmName) {
    result.filters.firmName = firmName;
    result.queryType = 'specific';
    result.intent = 'firm_info';
  }

  // Extract general search terms
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'what', 'who', 'where', 'when', 'why', 'how',
    'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'should', 'could', 'ought', 'i', 'me',
    'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'tell', 'show', 'find', 'get', 'give', 'list'
  ]);

  // Extract meaningful search terms
  const words = query.toLowerCase().split(/\s+/);
  const searchTerms = words.filter(word => {
    return word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word);
  });

  // Check for private placement specific queries
  const privatePlacementTerms = [
    'private placement', 'private fund', 'private equity', 'hedge fund',
    'alternative investment', 'private investment', 'fund management',
    'private capital', 'alternative fund'
  ];

  for (const term of privatePlacementTerms) {
    if (query.toLowerCase().includes(term)) {
      result.searchTerms.push(term);
      result.intent = 'private_placement';
      break;
    }
  }

  // Add specific investment-related terms if mentioned (and not private placement)
  if (result.intent !== 'private_placement') {
    const investmentTerms = [
      'sustainable', 'esg', 'retirement', 'wealth', 'hedge', 'private equity',
      'mutual fund', 'etf', 'fixed income', 'equity', 'alternative', 'crypto',
      'real estate', 'commodities', 'derivatives', 'options', 'futures'
    ];

    for (const term of investmentTerms) {
      if (query.toLowerCase().includes(term)) {
        result.searchTerms.push(term);
        if (result.intent === 'general') {
          result.intent = 'investment_focus';
        }
      }
    }
  }

  // If no specific search terms were found, add remaining meaningful words
  if (result.searchTerms.length === 0) {
    result.searchTerms = searchTerms;
  }

  return result;
}

/**
 * Build a SQL filter object based on parsed query
 */
export function buildSupabaseFilters(parsed: ParsedQuery): any {
  const filters: any = {};

  if (parsed.filters.state) {
    filters.state = parsed.filters.state;
  }

  if (parsed.filters.city) {
    filters.city = parsed.filters.city;
  }

  if (parsed.filters.firmName) {
    filters.firmName = parsed.filters.firmName;
  }

  return filters;
}

/**
 * Determine the appropriate limit for a query
 */
export function getQueryLimit(parsed: ParsedQuery): number {
  if (parsed.filters.limit) {
    return parsed.filters.limit;
  }

  switch (parsed.queryType) {
    case 'superlative':
      return parsed.filters.superlativeType === 'top' ? 5 : 1;
    case 'specific':
      return 1;
    case 'count':
      return 1000; // Get more for counting
    default:
      return 10;
  }
}