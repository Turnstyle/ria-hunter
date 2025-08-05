import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase, RIAProfile } from '@/lib/supabaseClient';
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
    console.log(`Applying state filter: ${parsed.filters.state}`);
    supabaseQuery = supabaseQuery.eq('state', parsed.filters.state);
  }
  
  // Handle specific firm name searches
  if (parsed.filters.firmName) {
    supabaseQuery = supabaseQuery.ilike('legal_name', `%${parsed.filters.firmName}%`);
  }
  
  // Handle superlative queries
  if (parsed.queryType === 'superlative') {
    if (parsed.filters.superlativeType === 'largest') {
      supabaseQuery = supabaseQuery.order('aum', { ascending: false });
    } else if (parsed.filters.superlativeType === 'smallest') {
      supabaseQuery = supabaseQuery.order('aum', { ascending: true });
    } else if (parsed.filters.superlativeType === 'top') {
      supabaseQuery = supabaseQuery.order('aum', { ascending: false });
    }
  }
  
  // For general searches, use text search on firm names if we have search terms
  if (parsed.queryType === 'search' && parsed.searchTerms.length > 0) {
    // Create an OR condition for all search terms
    const orConditions = parsed.searchTerms.map(term => 
      `legal_name.ilike.%${term}%`
    ).join(',');
    
    if (orConditions) {
      supabaseQuery = supabaseQuery.or(orConditions);
    }
  }
  
  // Always order by AUM descending as a secondary sort for relevance
  if (!parsed.filters.hasSuperlative) {
    supabaseQuery = supabaseQuery.order('aum', { ascending: false });
  }
  
  // Apply limit
  supabaseQuery = supabaseQuery.limit(queryLimit);
  
  const { data, error } = await supabaseQuery;
  
  if (error) {
    console.error('Supabase query error:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Perform vector similarity search on narratives
 */
async function searchNarratives(query: string, limit: number = 5): Promise<any[]> {
  try {
    // First, generate embedding for the query
    const embedding = await generateQueryEmbedding(query, aiProvider);
    
    if (!embedding) {
      return [];
    }
    
    // Perform vector similarity search
    const { data, error } = await supabase.rpc('match_narratives', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: limit
    });
    
    if (error) {
      console.error('Vector search error:', error);
      return [];
    }
    
    return data || [];
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
   - Assets Under Management: ${adviser.aum ? `$${adviser.aum.toLocaleString()}` : 'Not disclosed'}
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

    // For investment focus queries, also search narratives if we have few results
    let narratives: any[] = [];
    if (parsed.intent === 'investment_focus' || parsed.searchTerms.length > 0) {
      // Only search narratives if we have embeddings available
      // For now, we'll skip this until embeddings are generated
      // narratives = await searchNarratives(query, 5);
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

    return corsify(
      NextResponse.json({ answer, sources }, { status: 200 })
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