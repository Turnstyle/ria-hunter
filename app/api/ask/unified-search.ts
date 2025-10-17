import { performAINativeSearch } from './ai-native-search';
import { createAIService } from '@/lib/ai-providers';
import { createResilientAIService } from '@/lib/ai-resilience';

type UnifiedSearchOptions = {
  limit?: number;
  offset?: number;
};

export async function unifiedSemanticSearch(
  query: string,
  options: UnifiedSearchOptions = {}
) {
  const aiService = createResilientAIService(createAIService());
  if (!aiService) {
    throw new Error('AI service is not configured. Verify Vertex AI credentials.');
  }

  const result = await performAINativeSearch({
    query,
    limit: options.limit ?? 10,
    offset: options.offset ?? 0,
    aiService,
  });

  return {
    results: result.results,
    metadata: {
      searchStrategy: result.strategy,
      queryPlan: result.queryPlan,
      routing: result.routing,
      resultCount: result.results.length,
      availableResults: result.availableResults,
    },
  };
}
