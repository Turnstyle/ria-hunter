import { NextRequest, NextResponse } from 'next/server'
import { addCorsHeaders, handleOptionsRequest } from '@/lib/cors'

const DEPRECATED_PAYLOAD = {
  error: 'The /api/v1/ria/query endpoint has been deprecated. Please migrate to the unified RIA Hunter APIs.',
  code: 'ENDPOINT_DEPRECATED',
  migratedAt: '2024-09-01',
  alternatives: [
    {
      endpoint: '/api/ask',
      description: 'Unified natural language RAG endpoint with streaming support.'
    },
    {
      endpoint: '/api/v1/ria/search',
      description: 'Structured RIA search API with Supabase-backed filters.'
    }
  ]
}

function deprecatedResponse(req: NextRequest) {
  const response = NextResponse.json(DEPRECATED_PAYLOAD, { status: 410 })
  return addCorsHeaders(req, response)
}

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req)
}

export async function GET(req: NextRequest) {
  return deprecatedResponse(req)
}

export async function POST(req: NextRequest) {
  return deprecatedResponse(req)
}

