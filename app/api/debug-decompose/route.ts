import { NextResponse, type NextRequest } from 'next/server';
import { callLLMToDecomposeQuery, fallbackDecompose } from '../ask/planner';
import { corsHeaders, handleOptionsRequest } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Public endpoint for debugging - no auth required
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }
    
    // Try LLM decomposition
    let llmResult = null;
    let llmError = null;
    try {
      llmResult = await callLLMToDecomposeQuery(query);
    } catch (err: any) {
      llmError = err.message;
    }
    
    // Always run fallback
    const fallbackResult = fallbackDecompose(query);
    
    // Parse location from both
    const parseLocation = (location: string | null) => {
      if (!location) return { city: null, state: null };
      const parts = location.split(',').map(p => p.trim());
      if (parts.length === 2) {
        return { city: parts[0], state: parts[1] };
      } else if (parts.length === 1 && parts[0].length === 2) {
        return { city: null, state: parts[0] };
      } else {
        return { city: parts[0], state: null };
      }
    };
    
    const response = {
      query,
      llm: {
        success: !!llmResult,
        error: llmError,
        result: llmResult,
        parsedLocation: llmResult ? parseLocation(llmResult.structured_filters?.location) : null
      },
      fallback: {
        result: fallbackResult,
        parsedLocation: parseLocation(fallbackResult.structured_filters?.location)
      },
      whatWouldBeUsed: llmResult ? 'LLM' : 'fallback'
    };
    
    const headers = new Headers(corsHeaders);
    return NextResponse.json(response, { headers });
    
  } catch (error) {
    console.error('Debug decompose error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
