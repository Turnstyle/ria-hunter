/**
 * Query Decomposition with Gemini 2.0 Flash Function Calling
 * Based on Gemini Technical Specification Document Section 4.1
 * 
 * Uses Gemini's function calling capability to decompose user queries
 * into semantic search terms and structured filters
 */

import { VertexAI } from '@google-cloud/vertexai';
import { createAIService, getAIProvider, type AIProvider } from '@/lib/ai-providers';
import { createResilientAIService } from '@/lib/ai-resilience';

export type StructuredFilters = {
  location?: string | null;
  city?: string | null;
  state?: string | null;
  min_aum?: number | null;
  max_aum?: number | null;
  services?: string[] | null;
  fund_type?: string | null;
  has_vc_activity?: boolean | null;
};

export type QueryPlan = {
  semantic_query: string;
  structured_filters: StructuredFilters;
};

/**
 * Function calling schema for Gemini 2.0 Flash
 * Based on Gemini spec section 4.1.2
 */
const SEARCH_PLAN_FUNCTION = {
  name: 'search_plan',
  description: 'Generates a search plan by extracting a core semantic query and any available structured filters from the user\'s request.',
  parameters: {
    type: 'object',
    properties: {
      semantic_query: {
        type: 'string',
        description: 'The essential semantic concept of the user\'s query, stripped of all filters. For example, for "largest RIAs in St. Louis Missouri", this would be "largest RIAs".'
      },
      city: {
        type: 'string',
        description: 'The city name if mentioned. Extract the city naturally as understood (e.g., "St. Louis", "Saint Louis", "St Louis" all become "St. Louis").'
      },
      state: {
        type: 'string',
        description: 'The state name or abbreviation if mentioned. Normalize to full state name or standard abbreviation.'
      },
      min_aum: {
        type: 'number',
        description: 'The minimum assets under management if specified (in dollars).'
      },
      max_aum: {
        type: 'number',
        description: 'The maximum assets under management if specified (in dollars).'
      },
      fund_type: {
        type: 'string',
        description: 'The type of private fund if mentioned (e.g., "venture capital", "private equity", "hedge fund").'
      },
      has_vc_activity: {
        type: 'boolean',
        description: 'True if the user specifically asks for RIAs with venture capital or private equity activity.'
      },
      services: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific services mentioned like "private placements", "401k", "financial planning", etc.'
      }
    },
    required: ['semantic_query']
  }
};

/**
 * Few-shot examples for improved accuracy
 * Based on Gemini spec section 4.1.3
 */
const FEW_SHOT_EXAMPLES = `
Examples of query decomposition:

Query: "Find the largest RIAs in St. Louis Missouri"
Function Call: search_plan({
  semantic_query: "largest RIAs",
  city: "St. Louis",
  state: "Missouri"
})

Query: "Show me venture capital firms in California with over $1 billion AUM"
Function Call: search_plan({
  semantic_query: "venture capital firms",
  state: "California",
  min_aum: 1000000000,
  fund_type: "venture capital",
  has_vc_activity: true
})

Query: "RIAs offering private placements in New York"
Function Call: search_plan({
  semantic_query: "RIAs offering private placements",
  state: "New York",
  services: ["private placements"]
})

Query: "What are the top 10 largest RIAs in Missouri"
Function Call: search_plan({
  semantic_query: "top 10 largest RIAs",
  state: "Missouri"
})
`;

/**
 * Decompose query using Gemini 2.0 Flash with function calling
 * This is the enhanced implementation based on the Gemini spec
 */
export async function callGeminiToDecomposeQuery(userQuery: string): Promise<QueryPlan> {
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  
  if (!projectId) {
    console.warn('Gemini: Missing project ID, falling back to basic decomposition');
    return basicDecomposition(userQuery);
  }
  
  try {
    // Get credentials using the same approach as ai-providers.ts
    let credentials: any = null;
    
    if (process.env.GCP_SA_KEY_BASE64) {
      const credentialsJson = Buffer.from(
        process.env.GCP_SA_KEY_BASE64,
        'base64'
      ).toString('utf-8');
      credentials = JSON.parse(credentialsJson);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const fs = require('fs');
      const path = require('path');
      const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (fs.existsSync(credPath)) {
        credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      }
    }
    
    if (!credentials) {
      console.warn('Gemini: No credentials found, falling back to basic decomposition');
      return basicDecomposition(userQuery);
    }
    
    // Initialize Vertex AI with credentials
    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
      googleAuthOptions: { credentials }
    });
    
    // Get Gemini 2.0 Flash model
    const model = vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });
    
    // Create the prompt with few-shot examples
    const prompt = `${FEW_SHOT_EXAMPLES}

Now decompose this query about Registered Investment Advisors (RIAs):
"${userQuery}"

Important guidelines:
1. For locations, extract city and state separately when both are present
2. Understand that "St. Louis", "St Louis", and "Saint Louis" all refer to the same city
3. Recognize state abbreviations (MO = Missouri, NY = New York, etc.)
4. For superlative queries like "largest" or "top", keep that in the semantic_query
5. Extract fund types and VC activity when investment types are mentioned`;
    
    // Call Gemini with function calling
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{
        functionDeclarations: [SEARCH_PLAN_FUNCTION]
      }]
    };
    
    const result = await model.generateContent(request);
    const response = result.response;
    
    // Check if the model made a function call
    if (response.candidates && 
        response.candidates[0].content.parts &&
        response.candidates[0].content.parts[0].functionCall) {
      
      const functionCall = response.candidates[0].content.parts[0].functionCall;
      
      if (functionCall.name === 'search_plan' && functionCall.args) {
        // Extract the arguments from the function call
        const args = functionCall.args as any;
        
        // Build the structured filters, combining location if needed
        const filters: StructuredFilters = {
          city: args.city || null,
          state: args.state || null,
          min_aum: args.min_aum || null,
          max_aum: args.max_aum || null,
          fund_type: args.fund_type || null,
          has_vc_activity: args.has_vc_activity || null,
          services: args.services || null
        };
        
        // Add combined location field for backward compatibility
        if (args.city && args.state) {
          filters.location = `${args.city}, ${args.state}`;
        } else if (args.city || args.state) {
          filters.location = args.city || args.state;
        }
        
        console.log('Gemini function call successful:', {
          semantic_query: args.semantic_query,
          filters
        });
        
        return {
          semantic_query: args.semantic_query || userQuery,
          structured_filters: filters
        };
      }
    }
    
    // If no function call was made, try to parse the text response
    console.warn('Gemini did not make a function call, falling back to text parsing');
    return fallbackToTextParsing(userQuery, response);
    
  } catch (error) {
    console.error('Gemini decomposition failed:', error);
    return basicDecomposition(userQuery);
  }
}

/**
 * Fallback to the legacy LLM decomposition for backward compatibility
 */
export async function callLLMToDecomposeQuery(userQuery: string, provider?: AIProvider): Promise<QueryPlan> {
  // First try Gemini 2.0 Flash with function calling if using Vertex
  const currentProvider = getAIProvider(provider);
  if (currentProvider === 'vertex') {
    const geminiResult = await callGeminiToDecomposeQuery(userQuery);
    // If Gemini succeeded with meaningful decomposition, use it
    if (geminiResult.semantic_query !== userQuery || 
        Object.values(geminiResult.structured_filters).some(v => v !== null)) {
      return geminiResult;
    }
  }
  
  // Otherwise fall back to the original implementation
  let selectedProvider = currentProvider;
  const primaryService = createAIService({ provider: selectedProvider });
  const fallbackProvider = selectedProvider === 'vertex' ? 'openai' : 'vertex';
  const fallbackService = createAIService({ provider: fallbackProvider });
  
  const aiService = createResilientAIService(primaryService, fallbackService);
  
  if (!aiService) {
    console.warn('AI service not configured - using basic decomposition');
    return basicDecomposition(userQuery);
  }

  const prompt = `You are a sophisticated financial data analyst. Analyze this query about Registered Investment Advisors (RIAs): "${userQuery}"

Return a JSON object with exactly two keys:

1. "semantic_query": An enhanced version of the query for semantic search. Simply clarify and expand the intent naturally to match well against database narratives.

2. "structured_filters": Extract these specific filters if mentioned:
   - "location": Any location mentioned (city, state, or both). Return exactly as semantically understood, in "City, State" format if both are present.
   - "city": The city name if mentioned separately
   - "state": The state name if mentioned separately
   - "min_aum": Minimum assets under management if specified (in dollars)
   - "max_aum": Maximum assets under management if specified (in dollars)  
   - "services": Specific services like "private placements", "venture capital", etc.
   - "fund_type": Type of fund if mentioned
   - "has_vc_activity": true if looking for VC/PE activity

Important: The AI understands that "St. Louis", "St Louis", and "Saint Louis" all refer to the same city. Extract locations naturally.

Return ONLY the raw JSON object, no markdown or explanations.`;

  try {
    const result = await aiService.generateText(prompt);
    const text = result.text?.trim() || '';
    const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    
    const parsed = JSON.parse(stripped);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure from AI');
    if (!parsed.semantic_query || !parsed.structured_filters) throw new Error('Missing required keys in AI response');
    
    return parsed as QueryPlan;
  } catch (error) {
    console.error('AI decomposition failed:', error);
    return basicDecomposition(userQuery);
  }
}

/**
 * Basic decomposition without AI
 */
function basicDecomposition(userQuery: string): QueryPlan {
  return {
    semantic_query: userQuery,
    structured_filters: {
      location: null,
      city: null,
      state: null,
      min_aum: null,
      max_aum: null,
      services: null,
      fund_type: null,
      has_vc_activity: null
    }
  };
}

/**
 * Try to parse text response if function calling fails
 */
function fallbackToTextParsing(userQuery: string, response: any): QueryPlan {
  try {
    if (response.candidates && response.candidates[0].content.parts[0].text) {
      const text = response.candidates[0].content.parts[0].text;
      const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(stripped);
      
      if (parsed && parsed.semantic_query) {
        return {
          semantic_query: parsed.semantic_query,
          structured_filters: parsed.structured_filters || {}
        };
      }
    }
  } catch (error) {
    console.error('Failed to parse Gemini text response:', error);
  }
  
  return basicDecomposition(userQuery);
}
