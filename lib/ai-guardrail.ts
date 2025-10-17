import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { AIService, JsonSchema, StructuredJsonRequest } from './ai-providers';

export type QueryIntent = 'superlative' | 'location' | 'executive' | 'mixed';
export type SearchStrategy = 'hybrid' | 'structured' | 'executive';

export interface NormalizedLocation {
  city: string;
  state: string;
  variants: string[];
  confidence: number;
}

export interface QueryConstraints {
  sortBy?: 'aum' | 'employees' | 'funds';
  sortOrder?: 'desc' | 'asc';
  minAum?: number;
  requirePrivateFunds?: boolean;
}

export interface QueryPlan {
  intent: QueryIntent;
  normalizedLocation?: NormalizedLocation | null;
  constraints: QueryConstraints;
  searchStrategy: SearchStrategy;
  confidence: number;
}

type GuardrailResponse = QueryPlan & {
  rawLocationVariants?: string[];
};

const QUERY_CACHE = new LRUCache<string, QueryPlan>({
  max: 1000,
  ttl: 60 * 60 * 1000, // 1 hour
});

const LOCATION_CANONICAL = [
  {
    city: 'Saint Louis',
    state: 'MO',
    variants: ['St Louis', 'St. Louis', 'Saint Louis', 'STL', 'St-Louis'],
  },
  {
    city: 'New York',
    state: 'NY',
    variants: ['NYC', 'New York', 'New York City', 'NY'],
  },
  {
    city: 'Los Angeles',
    state: 'CA',
    variants: ['LA', 'L.A.', 'Los Angeles', 'Los-Angeles'],
  },
];

const QUERY_PLAN_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['superlative', 'location', 'executive', 'mixed'],
    },
    normalizedLocation: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        city: { type: 'string' },
        state: { type: 'string' },
        variants: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: { type: 'number' },
      },
      required: ['city', 'state', 'variants', 'confidence'],
    },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sortBy: { type: 'string', enum: ['aum', 'employees', 'funds'], nullable: true },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], nullable: true },
        minAum: { type: 'number', nullable: true },
        requirePrivateFunds: { type: 'boolean', nullable: true },
      },
      required: [],
    },
    searchStrategy: {
      type: 'string',
      enum: ['hybrid', 'structured', 'executive'],
    },
    confidence: {
      type: 'number',
    },
  },
  required: ['intent', 'constraints', 'searchStrategy', 'confidence'],
};

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function canonicalizeLocationVariant(variant: string): NormalizedLocation | null {
  const normalized = sanitize(variant);

  for (const location of LOCATION_CANONICAL) {
    const sanitizedVariants = location.variants.map((value) => sanitize(value));
    if (sanitizedVariants.includes(normalized)) {
      const formattedVariants = Array.from(
        new Set([...location.variants.map((value) => value.trim()), location.city])
      );
      return {
        city: location.city,
        state: location.state,
        variants: formattedVariants,
        confidence: 0.95,
      };
    }
  }

  return null;
}

function detectLocationFromQuery(query: string): NormalizedLocation | null {
  const cleanedQuery = sanitize(query);
  for (const location of LOCATION_CANONICAL) {
    for (const variant of location.variants) {
      if (cleanedQuery.includes(sanitize(variant))) {
        return {
          city: location.city,
          state: location.state,
          variants: Array.from(new Set([...location.variants.map((value) => value.trim()), location.city])),
          confidence: 0.9,
        };
      }
    }
  }
  return null;
}

function clampConfidence(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeConstraints(constraints?: QueryConstraints): QueryConstraints {
  if (!constraints) return {};
  const normalized: QueryConstraints = {};

  if (constraints.sortBy === 'aum' || constraints.sortBy === 'employees' || constraints.sortBy === 'funds') {
    normalized.sortBy = constraints.sortBy;
  }

  if (constraints.sortOrder === 'asc' || constraints.sortOrder === 'desc') {
    normalized.sortOrder = constraints.sortOrder;
  }

  if (typeof constraints.minAum === 'number' && Number.isFinite(constraints.minAum)) {
    normalized.minAum = constraints.minAum;
  }

  if (typeof constraints.requirePrivateFunds === 'boolean') {
    normalized.requirePrivateFunds = constraints.requirePrivateFunds;
  }

  return normalized;
}

function fallbackQueryPlan(query: string): QueryPlan {
  const lower = query.toLowerCase();
  const location = detectLocationFromQuery(query);

  const isExecutive =
    /\bceo\b|\bchief\b|\bprincipal\b|\bexecutives?\b|\bcontact\b/.test(lower);
  const isSuperlative = /\blargest\b|\bbiggest\b|\btop\b|\bhighest\b|\bmost\b/.test(lower);

  let intent: QueryIntent = 'mixed';
  if (isExecutive) intent = 'executive';
  else if (isSuperlative) intent = 'superlative';
  else if (location) intent = 'location';

  let searchStrategy: SearchStrategy = 'hybrid';
  if (intent === 'executive') searchStrategy = 'executive';
  else if (intent === 'location' && !isSuperlative) searchStrategy = 'structured';

  const constraints: QueryConstraints = {};
  if (intent === 'superlative') {
    constraints.sortBy = 'aum';
    constraints.sortOrder = 'desc';
  }

  return {
    intent,
    normalizedLocation: location,
    constraints,
    searchStrategy,
    confidence: 0.35,
  };
}

function buildGuardrailPrompt(query: string): StructuredJsonRequest<GuardrailResponse> {
  const systemInstruction = `You are an AI guardrail for investment adviser search. 
You MUST normalize all location variants to their canonical City, State format.
Key canonical mappings you must ALWAYS perform:
- "St Louis", "Saint Louis", "St. Louis", "STL" => "Saint Louis, MO"
- "NYC", "New York", "New York City" => "New York, NY"
- "LA", "Los Angeles" => "Los Angeles, CA"

Always return the structured JSON that matches the provided schema.`;

  const prompt = [
    `Analyze this investment adviser query and produce a deterministic plan.`,
    '',
    `Query: "${query}"`,
    '',
    'Tasks:',
    '1. Detect the primary intent of the query (superlative, location focus, executive lookup, or mixed).',
    '2. Normalize any city/state information to canonical form using the mappings above when applicable.',
    '3. Provide structured constraints such as sorting or minimum AUM requirements.',
    '4. Choose the best search strategy: hybrid (semantic + text), structured (simple filters), or executive (people lookup).',
    '5. Return a confidence score between 0 and 1.',
  ].join('\n');

  return {
    prompt,
    schema: QUERY_PLAN_SCHEMA,
    systemInstruction,
    temperature: 0,
    topP: 0.1,
  };
}

function postProcessResponse(query: string, response: GuardrailResponse): QueryPlan {
  const plan: QueryPlan = {
    intent: response.intent,
    constraints: normalizeConstraints(response.constraints),
    searchStrategy: response.searchStrategy,
    confidence: clampConfidence(response.confidence, 0.6),
  };

  const locationFromResponse = response.normalizedLocation;
  const fallbackLocation = detectLocationFromQuery(query);

  if (locationFromResponse) {
    const canonical = canonicalizeLocationVariant(locationFromResponse.city) || canonicalizeLocationVariant(locationFromResponse.state);
    if (canonical) {
      plan.normalizedLocation = {
        ...canonical,
        confidence: clampConfidence(locationFromResponse.confidence, canonical.confidence),
      };
    } else if (locationFromResponse.city && locationFromResponse.state) {
      plan.normalizedLocation = {
        city: locationFromResponse.city,
        state: locationFromResponse.state,
        variants: locationFromResponse.variants || [],
        confidence: clampConfidence(locationFromResponse.confidence, 0.6),
      };
    } else if (fallbackLocation) {
      plan.normalizedLocation = fallbackLocation;
    }
  } else if (fallbackLocation) {
    plan.normalizedLocation = fallbackLocation;
  }

  if (!plan.normalizedLocation && response.rawLocationVariants?.length) {
    for (const variant of response.rawLocationVariants) {
      const canonical = canonicalizeLocationVariant(variant);
      if (canonical) {
        plan.normalizedLocation = canonical;
        break;
      }
    }
  }

  if (plan.intent === 'executive') {
    plan.searchStrategy = 'executive';
  }

  return plan;
}

export async function preprocessQuery(query: string, aiService: AIService): Promise<QueryPlan> {
  const cacheKey = createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  const cached = QUERY_CACHE.get(cacheKey);
  if (cached) {
    console.log('✓ Cache hit for query preprocessing');
    return cached;
  }

  try {
    const request = buildGuardrailPrompt(query);
    const response = await aiService.generateStructuredJson<GuardrailResponse>(request);
    const plan = postProcessResponse(query, response);
    QUERY_CACHE.set(cacheKey, plan);
    return plan;
  } catch (error) {
    console.error('AI guardrail preprocessing failed:', error);
    const fallback = fallbackQueryPlan(query);
    QUERY_CACHE.set(cacheKey, fallback);
    return fallback;
  }
}
