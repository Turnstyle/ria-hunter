import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { AIService, JsonSchema } from './ai-providers';

export interface RoutingDecision {
  strategy: 'hybrid' | 'structured' | 'executive_search';
  needsLocationNormalization: boolean;
  isSuperlativeQuery: boolean;
  sortByAUM: boolean;
  confidence: number;
  reasoning: string;
}

const ROUTING_CACHE = new LRUCache<string, RoutingDecision>({
  max: 500,
  ttl: 30 * 60 * 1000, // 30 minutes
});

const ROUTING_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strategy: {
      type: 'string',
      enum: ['hybrid', 'structured', 'executive_search'],
    },
    needsLocationNormalization: { type: 'boolean' },
    isSuperlativeQuery: { type: 'boolean' },
    sortByAUM: { type: 'boolean' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['strategy', 'needsLocationNormalization', 'isSuperlativeQuery', 'sortByAUM', 'confidence', 'reasoning'],
};

function buildRoutingPrompt(query: string) {
  return {
    prompt: [
      'Classify this Registered Investment Adviser search query and produce routing instructions.',
      '',
      `Query: "${query}"`,
      '',
      'Return structured JSON describing:',
      '- The best search strategy: "hybrid" for semantic + text, "structured" for simple filters, "executive_search" for people lookups.',
      '- Whether location normalization is required (true if any city/state nicknames or abbreviations are present).',
      '- Whether the query is a superlative request (largest, biggest, top, etc.).',
      '- Whether the results should be sorted by AUM.',
      '- A confidence score between 0 and 1.',
      '- A one-sentence reasoning summary.',
    ].join('\n'),
    schema: ROUTING_SCHEMA,
    temperature: 0,
    topP: 0.1,
  };
}

function fallbackRouting(query: string): RoutingDecision {
  const lower = query.toLowerCase();
  const isExecutive =
    /\bceo\b|\bchief\b|\bcto\b|\bprincipal\b|\bexecutives?\b|\bcontact\b|\bperson\b/.test(lower);
  const isSuperlative = /\blargest\b|\bbiggest\b|\btop\b|\bmost\b|\bhigher\b|\bhighest\b/.test(lower);
  const hasLocationNick = /\bst[.\s]|saint|stl\b|nyc\b|los angeles|la\b/.test(lower);

  const decision: RoutingDecision = {
    strategy: 'hybrid',
    needsLocationNormalization: hasLocationNick,
    isSuperlativeQuery: isSuperlative,
    sortByAUM: isSuperlative,
    confidence: 0.4,
    reasoning: 'Heuristic fallback classification.',
  };

  if (isExecutive) {
    decision.strategy = 'executive_search';
    decision.sortByAUM = false;
  } else if (!isSuperlative && !hasLocationNick) {
    decision.strategy = 'structured';
  }

  return decision;
}

export async function routeQuery(query: string, aiService: AIService): Promise<RoutingDecision> {
  const cacheKey = createHash('sha256').update(`route_${query.toLowerCase().trim()}`).digest('hex');
  const cached = ROUTING_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const request = buildRoutingPrompt(query);
    const result = await aiService.generateStructuredJson<RoutingDecision>(request);

    const decision: RoutingDecision = {
      strategy: result.strategy,
      needsLocationNormalization: Boolean(result.needsLocationNormalization),
      isSuperlativeQuery: Boolean(result.isSuperlativeQuery),
      sortByAUM: Boolean(result.sortByAUM),
      confidence: Math.min(1, Math.max(0, typeof result.confidence === 'number' ? result.confidence : 0.6)),
      reasoning: result.reasoning || 'No reasoning provided.',
    };

    ROUTING_CACHE.set(cacheKey, decision);
    return decision;
  } catch (error) {
    console.error('Semantic routing failed:', error);
    const fallback = fallbackRouting(query);
    ROUTING_CACHE.set(cacheKey, fallback);
    return fallback;
  }
}
