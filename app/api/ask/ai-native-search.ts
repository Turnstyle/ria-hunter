import { preprocessQuery, type QueryPlan, type QueryConstraints, type NormalizedLocation } from '@/lib/ai-guardrail';
import { routeQuery, type RoutingDecision } from '@/lib/semantic-router';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { type AIService } from '@/lib/ai-providers';
import { validateProjectContext } from '@/lib/project-context';

type NumericLike = number | null | undefined;

export interface SearchResult {
  crd_number: number;
  legal_name: string;
  city: string;
  state: string;
  aum?: NumericLike;
  private_fund_count?: NumericLike;
  combined_rank?: number | null;
  semantic_score?: number | null;
  fts_score?: number | null;
  location_match_score?: number | null;
  similarity?: number | null;
  employees?: NumericLike;
  executives: Array<{ name?: string | null; title?: string | null }>;
  private_funds: Array<Record<string, any>>;
}

export interface SearchExecutionOptions {
  query: string;
  limit?: number;
  offset?: number;
  aiService: AIService;
  overrides?: {
    location?: {
      city?: string | null;
      state?: string | null;
    };
    constraints?: Partial<QueryConstraints>;
  };
}

export interface AINativeSearchResponse {
  results: SearchResult[];
  queryPlan: QueryPlan;
  routing: RoutingDecision;
  strategy: RoutingDecision['strategy'];
  availableResults: number;
}

function cloneQueryPlan(plan: QueryPlan): QueryPlan {
  return JSON.parse(JSON.stringify(plan)) as QueryPlan;
}

function enrichCityVariants(city: string | null | undefined, existing: string[] = []): string[] {
  const variants = new Set<string>();
  existing.forEach((value) => {
    if (value) variants.add(value);
  });

  if (!city) return Array.from(variants);

  const trimmed = city.trim();
  if (!trimmed) return Array.from(variants);

  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  const noDots = trimmed.replace(/\./g, '');
  const saintToSt = trimmed.replace(/\bsaint\b/gi, 'St').replace(/\bsaint\b/gi, 'St');
  const stToSaint = trimmed.replace(/\bst[.]?\b/gi, 'Saint');

  [trimmed, upper, lower, noDots, saintToSt, stToSaint].forEach((value) => {
    if (value && value.trim()) {
      variants.add(value.trim());
    }
  });

  return Array.from(variants);
}

function applyConstraintFilters(results: SearchResult[], constraints: QueryConstraints): SearchResult[] {
  return results.filter((row) => {
    if (typeof constraints.minAum === 'number' && Number.isFinite(constraints.minAum)) {
      const value = Number(row.aum ?? 0);
      if (!Number.isFinite(value) || value < constraints.minAum) {
        return false;
      }
    }

    if (constraints.requirePrivateFunds) {
      const count = Number(row.private_fund_count ?? 0);
      const hasFunds = count > 0 || (row.private_funds && row.private_funds.length > 0);
      if (!hasFunds) {
        return false;
      }
    }

    return true;
  });
}

function mergeConstraintOverrides(
  base: QueryConstraints,
  overrides?: Partial<QueryConstraints>
): QueryConstraints {
  if (!overrides) {
    return base;
  }

  const next: QueryConstraints = { ...base };

  if (overrides.sortBy && ['aum', 'employees', 'funds'].includes(overrides.sortBy)) {
    next.sortBy = overrides.sortBy;
  }

  if (overrides.sortOrder && ['asc', 'desc'].includes(overrides.sortOrder)) {
    next.sortOrder = overrides.sortOrder;
  }

  if (typeof overrides.minAum === 'number' && Number.isFinite(overrides.minAum)) {
    next.minAum = overrides.minAum;
  }

  if (typeof overrides.requirePrivateFunds === 'boolean') {
    next.requirePrivateFunds = overrides.requirePrivateFunds;
  }

  return next;
}

type HybridRow = {
  crd_number: number;
  firm_name: string;
  city: string;
  state: string;
  aum: NumericLike;
  employees?: NumericLike;
  private_fund_count: NumericLike;
  combined_rank: number | null;
  semantic_score: number | null;
  fts_score: number | null;
  location_match_score: number | null;
};

async function enrichWithRelatedData(rows: HybridRow[]): Promise<SearchResult[]> {
  if (!rows.length) {
    return [];
  }

  const crdNumbers = Array.from(new Set(rows.map((row) => row.crd_number).filter(Boolean)));

  const [executivesRes, fundsRes] = await Promise.all([
    crdNumbers.length
      ? supabaseAdmin
          .from('control_persons')
          .select('crd_number, person_name, title')
          .in('crd_number', crdNumbers)
      : { data: [], error: null },
    crdNumbers.length
      ? supabaseAdmin
          .from('ria_private_funds')
          .select('*')
          .in('crd_number', crdNumbers)
      : { data: [], error: null },
  ]);

  if (executivesRes.error) {
    console.warn('Failed to fetch executives:', executivesRes.error);
  }
  if (fundsRes.error) {
    console.warn('Failed to fetch private funds:', fundsRes.error);
  }

  const execByCrd = new Map<number, Array<{ name?: string | null; title?: string | null }>>();
  for (const exec of executivesRes.data || []) {
    const list = execByCrd.get(exec.crd_number) || [];
    list.push({ name: exec.person_name, title: exec.title });
    execByCrd.set(exec.crd_number, list);
  }

  const fundsByCrd = new Map<number, Array<Record<string, any>>>();
  for (const fund of fundsRes.data || []) {
    const list = fundsByCrd.get(fund.crd_number) || [];
    list.push(fund);
    fundsByCrd.set(fund.crd_number, list);
  }

  return rows.map((row) => ({
    crd_number: row.crd_number,
    legal_name: row.firm_name,
    city: row.city,
    state: row.state,
    aum: row.aum,
    employees: row.employees,
    private_fund_count: row.private_fund_count,
    combined_rank: row.combined_rank,
    semantic_score: row.semantic_score,
    fts_score: row.fts_score,
    location_match_score: row.location_match_score,
    similarity: row.semantic_score,
    executives: execByCrd.get(row.crd_number) || [],
    private_funds: fundsByCrd.get(row.crd_number) || [],
  }));
}

async function executeHybridSearch(
  query: string,
  queryPlan: QueryPlan,
  limit: number,
  offset: number,
  aiService: AIService
): Promise<SearchResult[]> {
  const embeddingResult = await aiService.generateEmbedding(query);
  if (!embeddingResult.embedding || !embeddingResult.embedding.length) {
    throw new Error('Vertex AI did not return a valid embedding for the query');
  }

  const needsAumFocus = queryPlan.constraints.sortBy === 'aum';
  const fetchLimit = needsAumFocus ? Math.max(limit * 5, limit + 20) : limit;

  const { data, error } = await supabaseAdmin.rpc('hybrid_search_rias', {
    query_text: query,
    query_embedding: embeddingResult.embedding,
    location_city: queryPlan.normalizedLocation?.city || null,
    location_state: queryPlan.normalizedLocation?.state || null,
    limit_count: fetchLimit,
    offset_count: offset,
  });

  if (error) {
    console.error('hybrid_search_rias RPC failed:', error);
    throw new Error(error.message || 'Hybrid search execution failed');
  }

  return enrichWithRelatedData((data || []) as HybridRow[]);
}

async function executeStructuredSearch(
  query: string,
  queryPlan: QueryPlan,
  limit: number,
  offset: number
): Promise<SearchResult[]> {
  let builder = supabaseAdmin
    .from('ria_profiles')
    .select(
      'crd_number, legal_name, city, state, aum, private_fund_count',
      { count: 'exact' }
    );

  const start = Math.max(0, offset);
  const end = start + Math.max(limit - 1, 0);
  builder = builder.range(start, end);

  const city = queryPlan.normalizedLocation?.city;
  const state = queryPlan.normalizedLocation?.state;

  if (state) {
    builder = builder.eq('state', state.toUpperCase());
  }

  const orFilters: string[] = [];

  if (city) {
    const variants = new Set<string>([city, ...(queryPlan.normalizedLocation?.variants || [])]);
    const normalizedVariants = Array.from(variants)
      .map((value) => value?.trim())
      .filter(Boolean) as string[];

    normalizedVariants.forEach((value) => {
      orFilters.push(`city.ilike.%${value}%`);
    });
  }

  const minAum = queryPlan.constraints.minAum;
  if (typeof minAum === 'number' && Number.isFinite(minAum)) {
    builder = builder.gte('aum', minAum);
  }

  if (query) {
    orFilters.push(`legal_name.ilike.%${query}%`);
    orFilters.push(`city.ilike.%${query}%`);
    orFilters.push(`state.ilike.%${query}%`);
  }

  if (orFilters.length) {
    builder = builder.or(Array.from(new Set(orFilters)).join(','));
  }

  const sortBy = queryPlan.constraints.sortBy || (queryPlan.intent === 'superlative' ? 'aum' : null);
  const sortOrder = queryPlan.constraints.sortOrder === 'asc' ? true : false;

  if (sortBy === 'employees') {
    builder = builder.order('employees', { ascending: sortOrder, nullsFirst: false });
  } else {
    builder = builder.order('aum', { ascending: sortOrder, nullsFirst: false });
  }

  const { data, error } = await builder;

  if (error) {
    console.error('Structured search failed:', error);
    throw new Error(error.message || 'Structured search failed');
  }

  const rows = (data || []).map((row) => ({
    crd_number: row.crd_number,
    firm_name: row.legal_name,
    city: row.city,
    state: row.state,
    aum: row.aum,
    employees: (row as any).employees ?? null,
    private_fund_count: row.private_fund_count,
    combined_rank: null,
    semantic_score: null,
    fts_score: null,
    location_match_score: null,
    similarity: null,
  }));

  return enrichWithRelatedData(rows);
}

async function executeExecutiveSearch(
  query: string,
  limit: number,
  offset: number
): Promise<SearchResult[]> {
  let execBuilder = supabaseAdmin
    .from('executives')
    .select('crd_number, name, title')
    .ilike('name', `%${query}%`);

  const start = Math.max(0, offset);
  const end = start + Math.max(limit - 1, 0);
  execBuilder = execBuilder.range(start, end);

  const { data: executives, error } = await execBuilder;
  if (error) {
    console.error('Executive search failed:', error);
    throw new Error(error.message || 'Executive search failed');
  }

  const crdNumbers = Array.from(
    new Set((executives || []).map((exec) => exec.crd_number).filter(Boolean))
  );

  if (!crdNumbers.length) {
    return [];
  }

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('ria_profiles')
    .select('crd_number, legal_name, city, state, aum, private_fund_count')
    .in('crd_number', crdNumbers);

  if (profileError) {
    console.error('Failed to load profiles for executive search:', profileError);
    throw new Error(profileError.message || 'Executive profile fetch failed');
  }

  const profileByCrd = new Map<number, any>();
  for (const profile of profiles || []) {
    profileByCrd.set(profile.crd_number, profile);
  }

  const groupedExecs = new Map<number, Array<{ name?: string | null; title?: string | null }>>();
  for (const exec of executives || []) {
    const list = groupedExecs.get(exec.crd_number) || [];
    list.push({ name: exec.name, title: exec.title });
    groupedExecs.set(exec.crd_number, list);
  }

  const rows: HybridRow[] = [];
  for (const crd of crdNumbers) {
    const profile = profileByCrd.get(crd);
    if (!profile) continue;
    rows.push({
      crd_number: crd,
      firm_name: profile.legal_name,
      city: profile.city,
      state: profile.state,
      aum: profile.aum,
      employees: (profile as any).employees ?? null,
      private_fund_count: profile.private_fund_count,
      combined_rank: null,
      semantic_score: null,
      fts_score: null,
      location_match_score: null,
    });
  }

  const enriched = await enrichWithRelatedData(rows);
  return enriched.map((row) => ({
    ...row,
    executives: groupedExecs.get(row.crd_number) || row.executives,
  }));
}

export async function performAINativeSearch(
  options: SearchExecutionOptions
): Promise<AINativeSearchResponse> {
  validateProjectContext();

  const limit = Math.max(options.limit ?? 10, 1);
  const offset = Math.max(options.offset ?? 0, 0);

  const basePlan = await preprocessQuery(options.query, options.aiService);
  const plan = cloneQueryPlan(basePlan);

  if (options.overrides?.location) {
    const { city, state } = options.overrides.location;

    if (city || state) {
      const baseLocation: NormalizedLocation | null = plan.normalizedLocation
        ? {
            city: plan.normalizedLocation.city,
            state: plan.normalizedLocation.state,
            variants: [...(plan.normalizedLocation.variants || [])],
            confidence: plan.normalizedLocation.confidence,
          }
        : basePlan.normalizedLocation
        ? {
            city: basePlan.normalizedLocation.city,
            state: basePlan.normalizedLocation.state,
            variants: [...(basePlan.normalizedLocation.variants || [])],
            confidence: basePlan.normalizedLocation.confidence,
          }
        : null;

      const fallbackCity = city || basePlan.normalizedLocation?.city || '';
      const fallbackState = state || basePlan.normalizedLocation?.state || '';
      const fallbackConfidence =
        baseLocation?.confidence ?? basePlan.normalizedLocation?.confidence ?? basePlan.confidence ?? 0.8;

      const updated: NormalizedLocation = baseLocation
        ? { ...baseLocation, variants: [...(baseLocation.variants || [])] }
        : {
            city: fallbackCity,
            state: fallbackState,
            variants: [],
            confidence: fallbackConfidence,
          };

      if (city) {
        updated.city = city;
        updated.variants = enrichCityVariants(city, updated.variants);
      } else if (updated.city) {
        updated.variants = enrichCityVariants(updated.city, updated.variants);
      }

      if (state) {
        updated.state = state.toUpperCase();
      } else if (updated.state) {
        updated.state = updated.state.toUpperCase();
      }

      plan.normalizedLocation = updated;
    }
  }

  plan.constraints = mergeConstraintOverrides(plan.constraints, options.overrides?.constraints);

  const routing = await routeQuery(options.query, options.aiService);

  if (routing.sortByAUM) {
    plan.constraints.sortBy = 'aum';
    if (!plan.constraints.sortOrder || plan.constraints.sortOrder === 'asc') {
      plan.constraints.sortOrder = 'desc';
    }
  }

  let results: SearchResult[] = [];
  let strategy: RoutingDecision['strategy'] = routing.strategy;

  if (routing.strategy === 'executive_search') {
    results = await executeExecutiveSearch(options.query, limit, offset);
  } else if (routing.strategy === 'structured') {
    results = await executeStructuredSearch(options.query, plan, limit, offset);
  } else {
    strategy = 'hybrid';
    results = await executeHybridSearch(options.query, plan, limit, offset, options.aiService);

    if (plan.constraints.sortBy === 'aum') {
      const structuredBoost = await executeStructuredSearch(
        options.query,
        plan,
        Math.max(limit, 25),
        offset
      );
      results = [...results, ...structuredBoost];
    }
  }

  results = applyConstraintFilters(results, plan.constraints);

  const ascendingSort = plan.constraints.sortOrder === 'asc';

  if (plan.constraints.sortBy === 'aum') {
    results = [...results].sort((a, b) => {
      const left = Number(a.aum ?? 0) || 0;
      const right = Number(b.aum ?? 0) || 0;
      return ascendingSort ? left - right : right - left;
    });
  } else if (plan.constraints.sortBy === 'employees') {
    results = [...results].sort((a, b) => {
      const left = Number(a.employees ?? 0) || 0;
      const right = Number(b.employees ?? 0) || 0;
      return ascendingSort ? left - right : right - left;
    });
  } else if (plan.constraints.sortBy === 'funds') {
    results = [...results].sort((a, b) => {
      const left = Number(a.private_fund_count ?? 0) || 0;
      const right = Number(b.private_fund_count ?? 0) || 0;
      return ascendingSort ? left - right : right - left;
    });
  }

  const deduped: SearchResult[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    const key = row.crd_number !== undefined
      ? String(row.crd_number)
      : `${row.legal_name ?? 'unknown'}-${row.city ?? ''}-${row.state ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }
  results = deduped;

  const totalAvailable = results.length;
  if (results.length > limit) {
    results = results.slice(0, limit);
  }

  return {
    results,
    queryPlan: plan,
    routing,
    strategy,
    availableResults: totalAvailable,
  };
}
