import { preprocessQuery } from '@/lib/ai-guardrail';
import { routeQuery } from '@/lib/semantic-router';
import type {
  AIService,
  EmbeddingResult,
  GenerationResult,
  StructuredJsonRequest,
} from '@/lib/ai-providers';

class MockAIService implements AIService {
  constructor(private structuredResponse: any, private error: Error | null = null) {}

  async generateEmbedding(_text: string): Promise<EmbeddingResult> {
    return { embedding: new Array(768).fill(0) };
  }

  async generateText(_prompt: string): Promise<GenerationResult> {
    return { text: '{}' };
  }

  async generateStructuredJson<T>(_request: StructuredJsonRequest<T>): Promise<T> {
    if (this.error) {
      throw this.error;
    }
    return this.structuredResponse as T;
  }
}

describe('AI guardrail preprocessing', () => {
  it('normalizes St. Louis variants to Saint Louis, MO', async () => {
    const response = {
      intent: 'superlative',
      normalizedLocation: {
        city: 'St Louis',
        state: 'Missouri',
        variants: ['St Louis'],
        confidence: 0.88,
      },
      constraints: {
        sortBy: 'aum',
        sortOrder: 'desc',
      },
      searchStrategy: 'hybrid',
      confidence: 0.92,
    };

    const aiService = new MockAIService(response);
    const plan = await preprocessQuery('largest RIAs in St. Louis', aiService);

    expect(plan.intent).toBe('superlative');
    expect(plan.constraints.sortBy).toBe('aum');
    expect(plan.searchStrategy).toBe('hybrid');
    expect(plan.normalizedLocation).toBeDefined();
    expect(plan.normalizedLocation?.city).toBe('Saint Louis');
    expect(plan.normalizedLocation?.state).toBe('MO');
    expect(plan.normalizedLocation?.variants).toContain('St Louis');
  });

  it('falls back gracefully when Vertex structured output fails', async () => {
    const aiService = new MockAIService(null, new Error('Vertex failure'));
    const plan = await preprocessQuery('top 10 RIAs in NYC', aiService);

    expect(plan.intent).toBe('superlative');
    expect(plan.searchStrategy).toBe('hybrid');
    expect(plan.normalizedLocation?.city).toBe('New York');
    expect(plan.normalizedLocation?.state).toBe('NY');
  });
});

describe('Semantic router', () => {
  it('classifies superlative query as hybrid with AUM sorting', async () => {
    const routingResponse = {
      strategy: 'hybrid',
      needsLocationNormalization: true,
      isSuperlativeQuery: true,
      sortByAUM: true,
      confidence: 0.93,
      reasoning: 'Superlative query about largest firms.',
    };

    const aiService = new MockAIService(routingResponse);
    const decision = await routeQuery('biggest RIAs in LA', aiService);

    expect(decision.strategy).toBe('hybrid');
    expect(decision.needsLocationNormalization).toBe(true);
    expect(decision.sortByAUM).toBe(true);
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it('falls back to heuristics when routing JSON fails', async () => {
    const aiService = new MockAIService(null, new Error('routing failure'));
    const decision = await routeQuery('find executives at Edward Jones', aiService);

    expect(decision.strategy).toBe('executive_search');
    expect(decision.sortByAUM).toBe(false);
  });
});
