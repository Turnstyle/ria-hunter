import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase, RIAProfile } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { VertexAI } from '@google-cloud/vertexai';
import { parseQuery, buildSupabaseFilters, getQueryLimit } from '@/lib/queryParser';
import { createAIService, getAIProvider, AIProvider } from '@/lib/ai-providers';

const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

/**
 * Creates a new Response with CORS headers from an existing response
 * This ensures headers are always present in production
 */
const corsify = (res: Response): Response => {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
};

// Initialize Vertex AI client
const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const model = 'gemini-1.5-flash';

// Initialize the Vertex AI client
let vertexAI: VertexAI | null = null;

if (projectId) {
  vertexAI = new VertexAI({
    project: projectId,
    location: location,
  });
}

interface AskRequest {
  query: string;
  limit?: number;
  aiProvider?: AIProvider; // Future: allow frontend to specify provider
}

interface AskResponse {
  answer: string;
  sources: Array<{
    firm_name: string;
    crd_number: string;
    city: string;
    state: string;
    aum?: number;
  }>;
}

/**
 * Check if user has exceeded their query limit for the current month
 */
async function checkQueryLimit(userId: string): Promise<{ allowed: boolean; remaining: number; isSubscriber: boolean }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    // Check subscription status first
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single();

    const isSubscriber = subscription && ['trialing', 'active'].includes(subscription.status);
    
    if (isSubscriber) {
      return { allowed: true, remaining: -1, isSubscriber: true }; // Unlimited for subscribers
    }

    // Count queries this month
    const { count: queryCount } = await supabaseAdmin
      .from('user_queries')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // Count share bonuses this month
    const { count: shareCount } = await supabaseAdmin
      .from('user_shares')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .gte('shared_at', startOfMonth.toISOString());

    // Calculate allowed queries: 2 base + max 1 share bonus
    const allowedQueries = 2 + Math.min(shareCount || 0, 1);
    const currentQueries = queryCount || 0;
    const remaining = Math.max(0, allowedQueries - currentQueries);
    
    return {
      allowed: currentQueries < allowedQueries,
      remaining,
      isSubscriber: false
    };
  } catch (error) {
    console.error('Error checking query limit:', error);
    // In case of error, allow the query but log it
    return { allowed: true, remaining: 0, isSubscriber: false };
  }
}

/**
 * Log a query usage for tracking purposes
 */
async function logQueryUsage(userId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('user_queries')
      .insert({ user_id: userId });
  } catch (error) {
    console.error('Error logging query usage:', error);
    // Don't fail the request if logging fails
  }
}

/**
 * Deduplicate RIA profiles by legal_name, keeping the one with highest AUM
 */
function deduplicateByFirmName(profiles: RIAProfile[]): RIAProfile[] {
  const firmMap = new Map<string, RIAProfile>();
  
  for (const profile of profiles) {
    const firmName = profile.legal_name?.trim().toLowerCase();
    if (!firmName) continue;
    
    const existing = firmMap.get(firmName);
    if (!existing) {
      firmMap.set(firmName, profile);
    } else {
      // Keep the one with higher AUM
      const currentAUM = Number(profile.aum) || 0;
      const existingAUM = Number(existing.aum) || 0;
      
      if (currentAUM > existingAUM) {
        firmMap.set(firmName, profile);
      }
    }
  }
  
  return Array.from(firmMap.values());
}

/**
 * Search for advisers based on the user's query with enhanced parsing
 */
async function searchAdvisers(query: string, limit?: number): Promise<RIAProfile[]> {
  const parsed = parseQuery(query);
  const queryLimit = limit || getQueryLimit(parsed);
  
  console.log('Parsed query:', JSON.stringify(parsed, null, 2));
  
  // Start building the query
  let supabaseQuery = supabase
    .from('ria_profiles')
    .select('*');
  
  // Apply state filter if present
  if (parsed.filters.state) {
    supabaseQuery = supabaseQuery.eq('state', parsed.filters.state);
  }

  // Apply city filter if present
  if (parsed.filters.city) {
    console.log(`Applying city filter: ${parsed.filters.city}`);
    // Handle various St. Louis formats
    if (parsed.filters.city === 'ST. LOUIS') {
      supabaseQuery = supabaseQuery.or('city.ilike.%ST. LOUIS%,city.ilike.%ST LOUIS%,city.ilike.%SAINT LOUIS%');
    } else {
      supabaseQuery = supabaseQuery.ilike('city', `%${parsed.filters.city}%`);
    }
  }
  
  // Handle specific firm name searches
  if (parsed.filters.firmName) {
    supabaseQuery = supabaseQuery.ilike('legal_name', `%${parsed.filters.firmName}%`);
  }

  // For private placement queries, filter for firms with actual private placement activity
  if (parsed.intent === 'private_placement') {
    console.log('Filtering for firms with private placement activity (private_fund_count > 0)');
    supabaseQuery = supabaseQuery.gt('private_fund_count', 0);
  }
  
  // Handle superlative queries
  if (parsed.queryType === 'superlative') {
    // For private placement queries, sort by private fund metrics
    if (parsed.intent === 'private_placement') {
      if (parsed.filters.superlativeType === 'largest') {
        supabaseQuery = supabaseQuery.order('private_fund_aum', { ascending: false });
      } else if (parsed.filters.superlativeType === 'smallest') {
        supabaseQuery = supabaseQuery.order('private_fund_count', { ascending: true });
      } else if (parsed.filters.superlativeType === 'top') {
        supabaseQuery = supabaseQuery.order('private_fund_count', { ascending: false });
      }
    } else {
      // Default to general AUM sorting
      if (parsed.filters.superlativeType === 'largest') {
        supabaseQuery = supabaseQuery.order('aum', { ascending: false });
      } else if (parsed.filters.superlativeType === 'smallest') {
        supabaseQuery = supabaseQuery.order('aum', { ascending: true });
      } else if (parsed.filters.superlativeType === 'top') {
        supabaseQuery = supabaseQuery.order('aum', { ascending: false });
      }
    }
  }
  
  // For general searches, use text search on firm names if we have search terms
  // BUT only if we don't have state/city filters (location queries should not do text search)
  if (parsed.queryType === 'search' && parsed.searchTerms.length > 0 && !parsed.filters.state && !parsed.filters.city) {
    // Create an OR condition for all search terms - proper Supabase syntax
    const orConditions = parsed.searchTerms.map(term => 
      `legal_name.ilike.*${term}*`
    ).join(',');
    
    if (orConditions) {
      supabaseQuery = supabaseQuery.or(orConditions);
    }
  }
  
  // Always order by appropriate metric as a secondary sort for relevance
  if (!parsed.filters.hasSuperlative) {
    if (parsed.intent === 'private_placement') {
      supabaseQuery = supabaseQuery.order('private_fund_count', { ascending: false });
    } else {
      supabaseQuery = supabaseQuery.order('aum', { ascending: false });
    }
  }
  
  // Apply limit
  supabaseQuery = supabaseQuery.limit(queryLimit);
  
  const { data, error } = await supabaseQuery;
  
  if (error) {
    console.error('Supabase query error:', error);
    return [];
  }
  
  if (!data) return [];
  
  // Deduplicate by legal_name, keeping the one with highest AUM
  const deduplicatedData = deduplicateByFirmName(data);
  
  return deduplicatedData;
}

/**
 * Perform semantic search on narratives using keyword analysis as fallback
 */
async function searchNarratives(query: string, limit: number = 5): Promise<any[]> {
  try {
    // Investment specialization keywords for semantic-like search
    const specializations = {
      'alternative': ['alternative', 'hedge fund', 'private equity', 'family office', 'institutional'],
      'real_estate': ['real estate', 'property', 'REIT', 'commercial', 'development'],
      'infrastructure': ['infrastructure', 'energy', 'utilities', 'renewable', 'project'],
      'venture': ['venture', 'startup', 'technology', 'growth capital', 'emerging'],
      'distressed': ['distressed', 'restructuring', 'turnaround', 'special situations'],
      'private_placement': ['private placement', 'private fund', 'alternative investment', 'accredited investor']
    };

    // Determine query intent and relevant keywords
    const queryLower = query.toLowerCase();
    let searchKeywords: string[] = [];
    
    Object.entries(specializations).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (queryLower.includes(keyword)) {
          searchKeywords.push(...keywords);
        }
      });
    });
    
    // If no specific keywords found, use general private placement terms
    if (searchKeywords.length === 0) {
      searchKeywords = specializations.private_placement;
    }
    
    // Search narratives using keyword matching
    let narrativeQuery = supabase
      .from('narratives')
      .select('crd_number, narrative')
      .not('narrative', 'is', null);
    
    // Build OR condition for keywords
    if (searchKeywords.length > 0) {
      const orConditions = searchKeywords.map(keyword => 
        `narrative.ilike.%${keyword}%`
      ).join(',');
      
      narrativeQuery = narrativeQuery.or(orConditions);
    }
    
    const { data, error } = await narrativeQuery.limit(limit * 3); // Get more to filter
    
    if (error) {
      console.error('Narrative search error:', error);
      return [];
    }
    
    // Score and rank results
    const scoredResults = (data || []).map(item => {
      const narrative = item.narrative.toLowerCase();
      let score = 0;
      
      searchKeywords.forEach(keyword => {
        const matches = (narrative.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      return {
        ...item,
        similarity: score / searchKeywords.length // Normalize score
      };
    })
    .filter(item => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
    
    return scoredResults;
  } catch (error) {
    console.error('Error in searchNarratives:', error);
    return [];
  }
}

/**
 * Generate embedding for a query using the configured AI provider
 */
async function generateQueryEmbedding(text: string, provider?: AIProvider): Promise<number[] | null> {
  const selectedProvider = getAIProvider(provider);
  const aiService = createAIService({ provider: selectedProvider });
  
  if (!aiService) {
    console.error(`AI service not available for provider: ${selectedProvider}`);
    return null;
  }

  try {
    const result = await aiService.generateEmbedding(text);
    return result.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Build a prompt for Gemini with the retrieved adviser data
 */
function buildPrompt(query: string, advisers: RIAProfile[], narratives?: any[]): string {
  const parsed = parseQuery(query);
  
  let prompt = `You are an expert assistant specializing in Registered Investment Advisers (RIAs). 
Your role is to provide accurate, data-driven answers based on the information provided.

User Question: ${query}

Available RIA Data:
`;

  advisers.forEach((adviser, index) => {
    prompt += `
${index + 1}. ${adviser.legal_name}
   - CRD Number: ${adviser.crd_number}
   - Location: ${adviser.city}, ${adviser.state}
   - Assets Under Management: ${adviser.aum ? `$${adviser.aum.toLocaleString()}` : 'Not disclosed'}`;
   
    // Add private placement info if available and relevant
    if (parsed.intent === 'private_placement' && (adviser.private_fund_count || adviser.private_fund_aum)) {
      prompt += `
   - Private Funds Managed: ${adviser.private_fund_count || 0}
   - Private Fund Assets: ${adviser.private_fund_aum ? `$${adviser.private_fund_aum.toLocaleString()}` : 'Not disclosed'}`;
    }
    
    prompt += `
   - Form ADV Date: ${adviser.form_adv_date || 'Not available'}
`;
  });

  // Add narrative context if available
  if (narratives && narratives.length > 0) {
    prompt += `\n\nAdditional Context from Firm Descriptions:\n`;
    narratives.forEach((narrative, index) => {
      if (narrative.narrative && narrative.crd_number) {
        const firm = advisers.find(a => a.crd_number === narrative.crd_number);
        if (firm) {
          prompt += `\n${firm.legal_name}: ${narrative.narrative.substring(0, 300)}...\n`;
        }
      }
    });
  }

  // Add specific instructions based on query type
  if (parsed.intent === 'private_placement') {
    prompt += `

IMPORTANT: This query is about private placement activity. Focus on:
- Number of private funds managed
- Private fund assets under management  
- Ranking should be based on private placement activity, not general AUM
- If private placement data is not available for a firm, mention this limitation
`;
  }
  if (parsed.queryType === 'superlative') {
    if (parsed.filters.superlativeType === 'largest') {
      prompt += `\n\nIMPORTANT INSTRUCTION: The user is asking for THE LARGEST RIA. You must:
1. Identify the single firm with the highest AUM from the data above
2. State clearly that this is the largest firm
3. Mention its AUM amount
4. Do NOT list multiple firms - only mention the single largest one`;
    } else if (parsed.filters.superlativeType === 'smallest') {
      prompt += `\n\nIMPORTANT INSTRUCTION: The user is asking for THE SMALLEST RIA. Identify only the single firm with the lowest AUM.`;
    } else if (parsed.filters.superlativeType === 'top') {
      const limit = parsed.filters.limit || 5;
      prompt += `\n\nIMPORTANT INSTRUCTION: List the top ${limit} firms by AUM in descending order.`;
    }
  } else if (parsed.queryType === 'count') {
    prompt += `\n\nIMPORTANT INSTRUCTION: Provide the exact count of firms based on the data provided.`;
  } else if (parsed.queryType === 'specific') {
    prompt += `\n\nIMPORTANT INSTRUCTION: Focus your answer specifically on the firm mentioned in the question.`;
  }

  // Add state-specific instruction if applicable
  if (parsed.filters.state) {
    prompt += `\n\nNOTE: All firms shown are located in ${parsed.filters.state}.`;
  }

  prompt += `\n\nProvide a clear, direct answer. Be concise but informative. If the data is insufficient, acknowledge this professionally.`;

  return prompt;
}

/**
 * Call AI to generate an answer using the configured provider
 */
async function generateAnswer(prompt: string, provider?: AIProvider): Promise<string> {
  const selectedProvider = getAIProvider(provider);
  console.log(`Selected AI provider: ${selectedProvider}, requested: ${provider}`);
  const aiService = createAIService({ provider: selectedProvider });
  
  if (!aiService) {
    console.log(`AI service not available for provider: ${selectedProvider}, using fallback response`);
    return 'Based on the RIA data provided above, I found several investment advisers that match your query. The information includes their names, locations, and assets under management where available.';
  }

  try {
    console.log(`Generating answer using ${selectedProvider}...`);
    const result = await aiService.generateText(prompt);
    return result.text;
  } catch (error: any) {
    console.error('Gemini API error:', error);
    console.error('Error details:', error.message);
    
    // Provide a structured fallback response based on the prompt data
    try {
      // Extract query and parse it
      const queryMatch = prompt.match(/User Question:\s*(.+?)\n/);
      const query = queryMatch ? queryMatch[1] : '';
      const parsed = parseQuery(query);
      
      // Extract RIA data from the prompt
      const riaMatches = prompt.matchAll(/(\d+)\.\s+(.+?)\n\s+-\s+CRD Number:\s+(\d+)\n\s+-\s+Location:\s+(.+?),\s+(.+?)\n\s+-\s+Assets Under Management:\s+\$(.+?)\n/g);
      const rias = Array.from(riaMatches).map(match => ({
        name: match[2],
        crd: match[3],
        city: match[4],
        state: match[5],
        aum: match[6]
      }));
      
      if (rias.length === 0) {
        return 'I found investment advisers matching your query, but I am having trouble formatting the response. Please check the source data below.';
      }
      
      // Generate appropriate response based on query type
      if (parsed.queryType === 'superlative' && parsed.filters.superlativeType === 'largest') {
        const largest = rias[0]; // Should already be sorted by AUM descending
        return `The largest RIA in ${parsed.filters.state || 'the search results'} is ${largest.name}, located in ${largest.city}, ${largest.state}, with approximately $${largest.aum} in assets under management.`;
      } else if (parsed.queryType === 'superlative' && parsed.filters.superlativeType === 'top') {
        const limit = parsed.filters.limit || 5;
        const topList = rias.slice(0, limit).map((ria, i) => 
          `${i + 1}. ${ria.name} (${ria.city}, ${ria.state}) - $${ria.aum} AUM`
        ).join('\n');
        return `Here are the top ${limit} RIAs in ${parsed.filters.state || 'the search results'}:\n\n${topList}`;
      } else if (parsed.queryType === 'count') {
        return `Based on the search results, I found ${rias.length} RIAs matching your criteria in ${parsed.filters.state || 'the database'}.`;
      }
      
      // Default response
      const summary = rias.slice(0, 3).map(ria => 
        `${ria.name} in ${ria.city}, ${ria.state} manages $${ria.aum} in assets`
      ).join('; ');
      return `I found several RIAs matching your query. Here are some examples: ${summary}.`;
      
    } catch (parseError) {
      console.error('Error parsing fallback response:', parseError);
      return 'Based on the RIA data provided above, I found several investment advisers that match your query. The information includes their names, locations, and assets under management where available.';
    }
  }
}

export function OPTIONS() {
  return corsify(new Response(null, { status: 204 }));
}

/** Main handler */
export async function POST(req: NextRequest) {
  try {
    // Extract user info from middleware headers
    const userId = req.headers.get('x-user-id');
    const userEmail = req.headers.get('x-user-email');

    if (!userId) {
      return corsify(
        NextResponse.json(
          { error: 'User authentication required' },
          { status: 401 }
        )
      );
    }

    // Check query limits before processing
    const limitCheck = await checkQueryLimit(userId);
    
    console.log(`Query limit check for user ${userId}:`, {
      allowed: limitCheck.allowed,
      remaining: limitCheck.remaining,
      isSubscriber: limitCheck.isSubscriber
    });
    
    if (!limitCheck.allowed) {
      const errorMessage = limitCheck.isSubscriber 
        ? 'Subscription expired. Please renew your subscription to continue.'
        : 'Free query limit reached for this month. Share on LinkedIn for +1 query or upgrade to Pro for unlimited queries.';
      
      console.log(`Query blocked for user ${userId}: ${errorMessage}`);
      
      return corsify(
        NextResponse.json(
          { 
            error: errorMessage,
            remaining: limitCheck.remaining,
            isSubscriber: limitCheck.isSubscriber,
            upgradeRequired: true
          },
          { status: 403 }
        )
      );
    }

    const body: AskRequest = await req.json();
    const { query, limit = 5, aiProvider } = body;

    if (!query || typeof query !== 'string') {
      return corsify(
        NextResponse.json(
          { error: 'Query parameter is required and must be a string' },
          { status: 400 }
        )
      );
    }

    // Parse the query to understand intent
    const parsed = parseQuery(query);
    
    // Search for relevant advisers
    const advisers = await searchAdvisers(query, limit);

    // For investment focus queries, also search narratives for enhanced context
    let narratives: any[] = [];
    if (parsed.intent === 'investment_focus' || parsed.intent === 'private_placement' || parsed.searchTerms.some(term => 
      ['alternative', 'private', 'fund', 'investment', 'equity', 'real estate', 'infrastructure'].includes(term.toLowerCase())
    )) {
      console.log('🔍 Performing semantic narrative search...');
      narratives = await searchNarratives(query, 5);
      console.log(`Found ${narratives.length} relevant narratives`);
    }

    if (advisers.length === 0) {
      const answer = "I couldn't find any advisers matching your query. Please try rephrasing your question or being more specific.";
      const sources: any[] = [];
      
      return corsify(
        NextResponse.json({ answer, sources }, { status: 200 })
      );
    }

    // Build prompt and generate answer
    const prompt = buildPrompt(query, advisers, narratives);
    const answer = await generateAnswer(prompt, aiProvider);

    // Prepare sources for response
    const sources = advisers.map(adviser => ({
      firm_name: adviser.legal_name,
      crd_number: adviser.crd_number,
      city: adviser.city,
      state: adviser.state,
      aum: adviser.aum,
    }));

    // Log the query usage after successful processing
    await logQueryUsage(userId);

    return corsify(
      NextResponse.json({ 
        answer, 
        sources,
        remaining: limitCheck.isSubscriber ? -1 : Math.max(0, limitCheck.remaining - 1),
        isSubscriber: limitCheck.isSubscriber
      }, { status: 200 })
    );
  } catch (error) {
    console.error('API error:', error);
    return corsify(
      NextResponse.json(
        { error: 'An error occurred processing your request' },
        { status: 500 }
      )
    );
  }
} 