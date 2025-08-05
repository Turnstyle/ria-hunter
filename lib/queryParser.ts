/**
 * Query parsing utilities for natural language processing
 */

import { extractStateFromQuery, hasSuperlative, isCountQuery, extractFirmName } from './states';

export interface ParsedQuery {
  originalQuery: string;
  queryType: 'search' | 'count' | 'specific' | 'superlative';
  filters: {
    state?: string;
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

  // Add specific investment-related terms if mentioned
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