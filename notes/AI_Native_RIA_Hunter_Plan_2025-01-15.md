<!-- 46a0e0fe-b8db-455b-80de-d6f219aae1d9 c93f220a-69e8-4a35-a2ba-f930e5db947a -->
# AI-Native Transformation Plan for RIA Hunter

**Reminder: You are the best full-stack developer in the world.** Approach each task with mastery and precision.

## Executive Summary

**Problem**: Current search returns 0 results or incorrect results for simple queries like "What are the 10 largest RIAs in St. Louis?" - missing obvious results like Edward Jones. This is a **result quality crisis**, not a performance issue.

**Root Cause**: Brittle SQL pattern matching that fails on location variants and poor semantic search quality.

**Solution**: Transform RIA Hunter to AI-native retrieval using:
- **Supabase pgvector HNSW indexes** optimized for 23K-105K RIA dataset on Micro tier
- **AI Guardrail Layer** (Vertex AI Gemini 2.0 Flash) for bulletproof query preprocessing
- **Hybrid Search** combining semantic + full-text with Reciprocal Rank Fusion
- **Supabase Extensions** (pg_similarity, pg_trgm) for fuzzy "St Louis" vs "Saint Louis" matching
- **In-Memory LRU Cache** for AI routing decisions (no external service)
- **Direct cutover** - DELETE old search logic. No fallbacks. Ride or die with AI-native.

**Current Environment**: 
- Micro tier Supabase
- 23K-105K RIA profiles
- Next.js API routes (no Edge Functions)
- Frontend remains unchanged
- Budget: Use Gemini 2.0 Flash (cheap, fast)

## Phase 1: Project Context Validation

**Critical First Step**: Verify correct project IDs to prevent cross-project contamination.

**Prompt for AI Agent**:
```
Verify the following project identifiers before proceeding:
1. Google Cloud Project ID: Read from .env or gcp-key.json
2. Supabase Project ID: Extract from NEXT_PUBLIC_SUPABASE_URL
3. GitHub Repository: Confirm owner/repo from git remote -v
4. Vercel Project: Query using Vercel MCP list_projects

Log these IDs at the start of execution and validate before each MCP operation.
```

**Code Example**:
```typescript
// lib/project-context.ts
export async function validateProjectContext() {
  const gcpProject = process.env.GOOGLE_PROJECT_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseProjectId = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!gcpProject || !supabaseProjectId) {
    throw new Error('Missing project context');
  }
  
  console.log('✓ Project Context:', { gcpProject, supabaseProjectId });
  return { gcpProject, supabaseProjectId };
}
```

## Phase 2: Implement AI Guardrail Layer with Query Cache

**Goal**: Create preprocessing layer that NEVER fails on location variants or intent classification.

**Prompt for AI Agent**:
```
Create an AI guardrail service with in-memory LRU cache that:
1. Normalizes ALL location variants ("St Louis", "Saint Louis", "St. Louis", "STL" → canonical form)
2. Identifies query intent with 100% accuracy using structured output from Gemini
3. Generates deterministic constraint objects
4. Returns structured QueryPlan with fallback strategies
5. Caches routing decisions using node-lru-cache (no external deps)

Use Vertex AI Gemini 2.0 Flash with JSON schema mode for guaranteed structured output.
Cache key: SHA-256 hash of normalized query string.
Cache TTL: 1 hour, max 1000 entries.

The service MUST handle these location variants perfectly:
- "St Louis" / "Saint Louis" / "St. Louis" / "STL" → "Saint Louis, MO"
- "NYC" / "New York" / "New York City" → "New York, NY"
- "LA" / "Los Angeles" → "Los Angeles, CA"
```

**Code Example**:
```typescript
// lib/ai-guardrail.ts
import LRU from 'lru-cache';
import { createHash } from 'crypto';

interface QueryPlan {
  intent: 'superlative' | 'location' | 'executive' | 'mixed';
  normalizedLocation?: { 
    city: string; 
    state: string; 
    variants: string[];
    confidence: number; 
  };
  constraints: {
    sortBy?: 'aum' | 'employees' | 'funds';
    sortOrder?: 'desc' | 'asc';
    minAum?: number;
    requirePrivateFunds?: boolean;
  };
  searchStrategy: 'hybrid' | 'structured';
  confidence: number;
}

const queryCache = new LRU<string, QueryPlan>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
});

export async function preprocessQuery(
  query: string,
  aiService: AIService
): Promise<QueryPlan> {
  const cacheKey = createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  
  const cached = queryCache.get(cacheKey);
  if (cached) {
    console.log('✓ Cache hit for query preprocessing');
    return cached;
  }
  
  // Use Gemini with JSON schema mode for structured output
  const prompt = `Analyze this investment adviser query and return structured JSON:

Query: "${query}"

Extract:
1. Location (normalize variants: "St Louis"→"Saint Louis", "NYC"→"New York", etc.)
2. Intent (superlative=largest/top, location=find in X, executive=person lookup)
3. Constraints (AUM threshold, sorting preference)
4. Search strategy (hybrid for complex, structured for simple)

Return JSON matching this schema:
{
  "intent": "superlative|location|executive|mixed",
  "normalizedLocation": {
    "city": "canonical city name",
    "state": "2-letter code",
    "variants": ["all possible spellings"],
    "confidence": 0.0-1.0
  },
  "constraints": {
    "sortBy": "aum|employees|funds",
    "sortOrder": "desc|asc",
    "minAum": null or number
  },
  "searchStrategy": "hybrid|structured",
  "confidence": 0.0-1.0
}`;

  const result = await aiService.generateText(prompt);
  const plan: QueryPlan = JSON.parse(result.text);
  
  queryCache.set(cacheKey, plan);
  return plan;
}
```

**Dependencies**: `npm install lru-cache`

## Phase 3: Enable Supabase Extensions & Create Optimized Indexes

**Goal**: Configure pgvector HNSW and fuzzy matching for Micro tier with 23K-105K dataset.

**Prompt for AI Agent**:
```
Enable Supabase extensions and create indexes optimized for Micro tier (1GB RAM):

1. Verify pgvector is enabled (should already exist)
2. Enable pg_trgm for trigram fuzzy matching
3. Create HNSW index with conservative parameters for Micro tier:
   - m = 16 (lower memory footprint)
   - ef_construction = 40 (faster build time)
   - Use vector_ip_ops for inner product (embeddings are normalized)
4. Add trigram indexes on city and state columns
5. Create generated tsvector column for full-text search
6. Add GIN index on tsvector

Use Supabase MCP to search_docs first, then execute_sql via apply_migration.
Name migration: "20250115_ai_native_search_indexes"
```

**SQL Migration**:
```sql
-- Migration: 20250115_ai_native_search_indexes
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify pgvector exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not found - enable it first';
  END IF;
END $$;

-- Create HNSW index optimized for Micro tier (1GB RAM, 23K-105K rows)
CREATE INDEX IF NOT EXISTS ria_profiles_embedding_hnsw_idx 
ON ria_profiles 
USING hnsw (narrative_embedding vector_ip_ops)
WITH (m = 16, ef_construction = 40);

-- Trigram indexes for fuzzy location matching
CREATE INDEX IF NOT EXISTS ria_profiles_city_trgm_idx 
ON ria_profiles USING gin (lower(city) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ria_profiles_state_trgm_idx 
ON ria_profiles USING gin (lower(state) gin_trgm_ops);

-- Full-text search column and index
ALTER TABLE ria_profiles 
ADD COLUMN IF NOT EXISTS fts_document tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(firm_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(state, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS ria_profiles_fts_idx 
ON ria_profiles USING gin (fts_document);

-- Update statistics for query planner
ANALYZE ria_profiles;
```

## Phase 4: Implement Hybrid Search with RRF

**Goal**: Create hybrid search that CANNOT fail on location variants.

**Prompt for AI Agent**:
```
Create a Postgres function hybrid_search_rias that:

1. Accepts fuzzy location parameters (uses % operator from pg_trgm)
2. Combines semantic search (HNSW) + full-text search (GIN)
3. Uses Reciprocal Rank Fusion to merge results
4. Returns top results with combined_rank score
5. ALWAYS returns results even if location fuzzy match is weak

Key requirements:
- Use similarity(city, location_city) > 0.3 for fuzzy matching (very lenient)
- Semantic weight: 1.0, Full-text weight: 0.8
- RRF k=50 for balanced fusion
- Return rich data including executives, AUM, private funds

Test with: "What are the 10 largest RIAs in St. Louis?"
Expected: Edward Jones MUST appear in top 3 results.
```

**SQL Function**:
```sql
CREATE OR REPLACE FUNCTION hybrid_search_rias(
  query_text TEXT,
  location_city TEXT DEFAULT NULL,
  location_state TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 10,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  firm_name TEXT,
  city TEXT,
  state TEXT,
  aum BIGINT,
  employees INTEGER,
  private_funds INTEGER,
  executives JSONB,
  combined_rank FLOAT,
  semantic_score FLOAT,
  fts_score FLOAT,
  location_match_score FLOAT
) AS $$
DECLARE
  query_embedding VECTOR(768);
  semantic_weight FLOAT := 1.0;
  fts_weight FLOAT := 0.8;
  rrf_k INTEGER := 50;
BEGIN
  -- Get query embedding (assumes you have a function to generate embeddings)
  SELECT get_query_embedding(query_text) INTO query_embedding;
  
  RETURN QUERY
  WITH semantic_search AS (
    SELECT 
      rp.id,
      rp.firm_name,
      rp.city,
      rp.state,
      rp.aum,
      rp.employees,
      rp.private_funds,
      rp.executives,
      (1 - (rp.narrative_embedding <=> query_embedding)) as semantic_score,
      ROW_NUMBER() OVER (ORDER BY rp.narrative_embedding <=> query_embedding) as semantic_rank
    FROM ria_profiles rp
    WHERE rp.narrative_embedding IS NOT NULL
  ),
  fts_search AS (
    SELECT 
      rp.id,
      rp.firm_name,
      rp.city,
      rp.state,
      rp.aum,
      rp.employees,
      rp.private_funds,
      rp.executives,
      ts_rank(rp.fts_document, plainto_tsquery('english', query_text)) as fts_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank(rp.fts_document, plainto_tsquery('english', query_text)) DESC) as fts_rank
    FROM ria_profiles rp
    WHERE rp.fts_document @@ plainto_tsquery('english', query_text)
  ),
  location_filtered AS (
    SELECT 
      COALESCE(s.id, f.id) as id,
      COALESCE(s.firm_name, f.firm_name) as firm_name,
      COALESCE(s.city, f.city) as city,
      COALESCE(s.state, f.state) as state,
      COALESCE(s.aum, f.aum) as aum,
      COALESCE(s.employees, f.employees) as employees,
      COALESCE(s.private_funds, f.private_funds) as private_funds,
      COALESCE(s.executives, f.executives) as executives,
      COALESCE(s.semantic_score, 0) as semantic_score,
      COALESCE(f.fts_score, 0) as fts_score,
      COALESCE(s.semantic_rank, 999999) as semantic_rank,
      COALESCE(f.fts_rank, 999999) as fts_rank,
      CASE 
        WHEN location_city IS NOT NULL THEN 
          GREATEST(
            similarity(COALESCE(s.city, f.city), location_city),
            similarity(COALESCE(s.city, f.city), location_state)
          )
        ELSE 1.0
      END as location_match_score
    FROM semantic_search s
    FULL OUTER JOIN fts_search f ON s.id = f.id
    WHERE 
      location_city IS NULL 
      OR similarity(COALESCE(s.city, f.city), location_city) > 0.3
      OR similarity(COALESCE(s.city, f.city), location_state) > 0.3
  ),
  rrf_combined AS (
    SELECT 
      id,
      firm_name,
      city,
      state,
      aum,
      employees,
      private_funds,
      executives,
      semantic_score,
      fts_score,
      location_match_score,
      -- Reciprocal Rank Fusion
      (1.0 / (rrf_k + semantic_rank)) * semantic_weight + 
      (1.0 / (rrf_k + fts_rank)) * fts_weight as combined_rank
    FROM location_filtered
  )
  SELECT 
    r.id,
    r.firm_name,
    r.city,
    r.state,
    r.aum,
    r.employees,
    r.private_funds,
    r.executives,
    r.combined_rank,
    r.semantic_score,
    r.fts_score,
    r.location_match_score
  FROM rrf_combined r
  ORDER BY r.combined_rank DESC, r.location_match_score DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;
```

## Phase 5: Implement Vertex AI Semantic Router

**Goal**: Create intelligent query classification and search strategy selection.

**Prompt for AI Agent**:
```
Create a semantic router using Vertex AI Gemini 2.0 Flash that:

1. Classifies queries into search strategies (hybrid vs structured)
2. Determines if location normalization is needed
3. Identifies superlative queries requiring AUM sorting
4. Detects executive name searches
5. Returns routing decisions with confidence scores

Use structured output with JSON schema for reliability.
Cache routing decisions for 30 minutes using in-memory LRU cache.
```

**Code Example**:
```typescript
// lib/semantic-router.ts
interface RoutingDecision {
  strategy: 'hybrid' | 'structured' | 'executive_search';
  needsLocationNormalization: boolean;
  isSuperlativeQuery: boolean;
  sortByAUM: boolean;
  confidence: number;
  reasoning: string;
}

export async function routeQuery(
  query: string,
  aiService: AIService
): Promise<RoutingDecision> {
  const cacheKey = `route_${createHash('sha256').update(query.toLowerCase().trim()).digest('hex')}`;
  
  const cached = routingCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const prompt = `Classify this investment adviser query and return routing decision:

Query: "${query}"

Determine:
1. Strategy: hybrid (complex semantic), structured (simple filters), executive_search (person lookup)
2. Needs location normalization (contains city/state variants)
3. Is superlative query (largest, biggest, top, etc.)
4. Should sort by AUM (financial size queries)
5. Confidence level (0-1)

Return JSON:
{
  "strategy": "hybrid|structured|executive_search",
  "needsLocationNormalization": boolean,
  "isSuperlativeQuery": boolean,
  "sortByAUM": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}`;

  const result = await aiService.generateText(prompt);
  const decision: RoutingDecision = JSON.parse(result.text);
  
  routingCache.set(cacheKey, decision, 30 * 60 * 1000); // 30 minutes
  return decision;
}
```

## Phase 6: Integrate AI-Native Search into /api/ask

**Goal**: Replace brittle SQL with AI-native search while maintaining API contract.

**Prompt for AI Agent**:
```
Modify /api/ask endpoint to:

1. Use AI guardrail for query preprocessing
2. Route through semantic router
3. Execute hybrid search with proper parameters
4. Return results in existing format
5. Maintain backward compatibility
6. Add comprehensive error handling

Key requirements:
- NO changes to frontend required
- Preserve existing response structure
- Add query preprocessing logging
- Handle edge cases gracefully
- Return meaningful error messages
```

**Code Example**:
```typescript
// app/api/ask/route.ts
export async function POST(request: Request) {
  try {
    const { query, limit = 10, offset = 0 } = await request.json();
    
    // Step 1: AI Guardrail preprocessing
    const queryPlan = await preprocessQuery(query, aiService);
    console.log('Query Plan:', queryPlan);
    
    // Step 2: Semantic routing
    const routing = await routeQuery(query, aiService);
    console.log('Routing Decision:', routing);
    
    // Step 3: Execute search based on strategy
    let results;
    if (routing.strategy === 'hybrid') {
      results = await executeHybridSearch(queryPlan, routing, limit, offset);
    } else if (routing.strategy === 'structured') {
      results = await executeStructuredSearch(queryPlan, limit, offset);
    } else {
      results = await executeExecutiveSearch(queryPlan, limit, offset);
    }
    
    // Step 4: Format response (maintain existing structure)
    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        id: r.id,
        firm_name: r.firm_name,
        city: r.city,
        state: r.state,
        aum: r.aum,
        employees: r.employees,
        private_funds: r.private_funds,
        executives: r.executives,
        score: r.combined_rank
      })),
      query_plan: queryPlan,
      routing: routing,
      total: results.length
    });
    
  } catch (error) {
    console.error('AI-Native Search Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Search failed. Please try rephrasing your query.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
```

## Phase 7: Testing & Validation

**Goal**: Ensure AI-native search works perfectly for the St. Louis test case.

**Prompt for AI Agent**:
```
Create comprehensive test suite:

1. Test location normalization ("St Louis" → "Saint Louis")
2. Test superlative queries ("10 largest RIAs in St. Louis")
3. Test fuzzy matching (tolerance for typos)
4. Test performance benchmarks
5. Test edge cases and error handling

Critical test: "What are the 10 largest RIAs in St. Louis?"
MUST return Edward Jones in top 3 results.
```

## Phase 8: Documentation & Deployment

**Goal**: Document the AI-native architecture and deploy to production.

**Prompt for AI Agent**:
```
1. Update API documentation with new AI-native capabilities
2. Create architecture diagrams showing the AI pipeline
3. Document the query preprocessing flow
4. Create troubleshooting guide
5. Deploy to Vercel with proper environment variables
6. Monitor performance and results quality

Ensure all documentation is in the existing BACKEND_API_DOCUMENTATION.md file.
```

### To-dos

- [ ] Create project context validation utility and verify all project IDs (GCP, Supabase, GitHub, Vercel)
- [ ] Implement AI guardrail preprocessing layer with Vertex AI Gemini Flash for query normalization and intent classification
- [ ] Enable pgvector, pg_similarity, and pg_trgm extensions; create HNSW and trigram indexes via Supabase MCP
- [ ] Create hybrid_search_rias SQL function implementing RRF with semantic + full-text + fuzzy matching
- [ ] Implement Vertex AI semantic router for query classification and search strategy selection
- [ ] Integrate guardrail, router, and hybrid search into /api/ask endpoint while maintaining existing API contract
- [ ] Create test suite for location normalization, intent classification, and performance benchmarking
- [ ] Update all documentation, create architecture diagrams, and deploy to Vercel with proper environment configuration
