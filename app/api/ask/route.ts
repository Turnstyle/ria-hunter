import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase, RIAProfile } from '@/lib/supabaseClient';
import { VertexAI } from '@google-cloud/vertexai';

const ALLOW_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Attach CORS headers to any Response */
const withCors = (res: Response) => {
  res.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res;
};

// Initialize Vertex AI client
const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
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
 * Search for advisers based on the user's query
 * This is a basic implementation - can be enhanced with vector search
 */
async function searchAdvisers(query: string, limit: number = 5): Promise<RIAProfile[]> {
  // Extract potential search terms from the query
  const queryLower = query.toLowerCase();
  
  // Try to extract state codes, cities, or firm names
  const stateMatch = queryLower.match(/\b(in|from|near)\s+([a-z]{2})\b/);
  const state = stateMatch ? stateMatch[2].toUpperCase() : null;
  
  // Build the query
  let supabaseQuery = supabase
    .from('ria_profiles')
    .select('*');
  
  // Apply filters based on query content
  if (state) {
    supabaseQuery = supabaseQuery.eq('state', state);
  }
  
  // Search for firms by name if query contains specific terms
  if (queryLower.includes('firm') || queryLower.includes('company')) {
    const searchTerms = query.split(' ').filter(term => term.length > 3);
    for (const term of searchTerms) {
      supabaseQuery = supabaseQuery.ilike('firm_name', `%${term}%`);
    }
  }
  
  // Order by AUM if query mentions size/largest/biggest
  if (queryLower.includes('largest') || queryLower.includes('biggest') || queryLower.includes('top')) {
    supabaseQuery = supabaseQuery.order('aum', { ascending: false });
  }
  
  // Limit results
  supabaseQuery = supabaseQuery.limit(limit);
  
  const { data, error } = await supabaseQuery;
  
  if (error) {
    console.error('Supabase query error:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Build a prompt for Gemini with the retrieved adviser data
 */
function buildPrompt(query: string, advisers: RIAProfile[]): string {
  let prompt = `You are a helpful assistant that answers questions about Registered Investment Advisers (RIAs). 
Based on the following data about RIAs, please answer the user's question.

User Question: ${query}

Available RIA Data:
`;

  advisers.forEach((adviser, index) => {
    prompt += `
${index + 1}. ${adviser.firm_name}
   - CRD Number: ${adviser.crd_number}
   - Location: ${adviser.city}, ${adviser.state} ${adviser.zip_code}
   - Phone: ${adviser.phone || 'Not provided'}
   - Website: ${adviser.website || 'Not provided'}
   - Assets Under Management: ${adviser.aum ? `$${adviser.aum.toLocaleString()}` : 'Not disclosed'}
   - Employee Count: ${adviser.employee_count || 'Not disclosed'}
`;
  });

  prompt += `
Please provide a helpful and accurate answer based on this data. If the data doesn't fully answer the question, 
explain what information is available and what might be missing.`;

  return prompt;
}

/**
 * Call Gemini to generate an answer
 */
async function generateAnswer(prompt: string): Promise<string> {
  if (!vertexAI) {
    throw new Error('Vertex AI client not initialized. Please check your Google Cloud configuration.');
  }

  try {
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: model,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
        topP: 0.8,
      },
    });

    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const result = await generativeModel.generateContent(request);
    const response = result.response;
    
    if (response.candidates && response.candidates[0].content.parts[0].text) {
      return response.candidates[0].content.parts[0].text;
    }
    
    return 'I was unable to generate a response. Please try again.';
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to generate answer from AI model');
  }
}

export function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

/** Main handler */
export async function POST(req: NextRequest) {
  try {
    const body: AskRequest = await req.json();
    const { query, limit = 5 } = body;

    if (!query || typeof query !== 'string') {
      return withCors(
        NextResponse.json(
          { error: 'Query parameter is required and must be a string' },
          { status: 400 }
        )
      );
    }

    // Search for relevant advisers
    const advisers = await searchAdvisers(query, limit);

    if (advisers.length === 0) {
      const answer = "I couldn't find any advisers matching your query. Please try rephrasing your question or being more specific.";
      const sources: any[] = [];
      
      return withCors(
        NextResponse.json({ answer, sources }, { status: 200 })
      );
    }

    // Build prompt and generate answer
    const prompt = buildPrompt(query, advisers);
    const answer = await generateAnswer(prompt);

    // Prepare sources for response
    const sources = advisers.map(adviser => ({
      firm_name: adviser.firm_name,
      crd_number: adviser.crd_number,
      city: adviser.city,
      state: adviser.state,
      aum: adviser.aum,
    }));

    return withCors(
      NextResponse.json({ answer, sources }, { status: 200 })
    );
  } catch (error) {
    console.error('API error:', error);
    return withCors(
      NextResponse.json(
        { error: 'An error occurred processing your request' },
        { status: 500 }
      )
    );
  }
} 