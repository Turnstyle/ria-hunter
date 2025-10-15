import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAIService } from '@/lib/ai-providers'

type CheckResult = { ok: boolean; error?: string; meta?: Record<string, unknown> }

function bool(b: any): boolean { return !!b }

function guard(request: NextRequest): string | null {
  const expected = process.env.DEBUG_HEALTH_KEY
  if (!expected) return null
  const provided = request.headers.get('x-debug-key') || request.nextUrl.searchParams.get('key')
  if (provided !== expected) return 'Forbidden'
  return null
}

export async function GET(request: NextRequest) {
  const guardError = guard(request)
  if (guardError) return NextResponse.json({ error: guardError }, { status: 403 })

  const results: Record<string, CheckResult> = {}

  // Environment presence
  results.env = {
    ok: true,
    meta: {
      googleProjectId: process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'unset',
      vertexLocation: process.env.VERTEX_AI_LOCATION || 'us-central1',
      serviceAccountBase64: bool(process.env.GCP_SA_KEY_BASE64),
      supabaseUrlPresent: bool(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      serviceRolePresent: bool(process.env.SUPABASE_SERVICE_ROLE_KEY),
      nodeEnv: process.env.NODE_ENV,
    },
  }

  // Supabase connectivity + table checks
  try {
    const ping = await supabaseAdmin.from('ria_profiles').select('crd_number', { count: 'exact', head: true })
    
    // Get detailed database info
    const { count: totalProfiles } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
    
    const { count: placeholderCount } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
      .in('legal_name', ['N', 'Y'])
    
    // Test specific profile
    const { data: edwardJones } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name')
      .eq('crd_number', 29880)
      .single()
    
    results.supabase_ping = { 
      ok: !ping.error, 
      error: ping.error?.message,
      database_url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.substring(0, 50) + '...',
      total_profiles: totalProfiles,
      placeholder_profiles: placeholderCount,
      edward_jones_test: {
        found: !!edwardJones,
        legal_name: edwardJones?.legal_name || null
      }
    }
  } catch (e: any) {
    results.supabase_ping = { ok: false, error: e?.message || String(e) }
  }

  // RPC existence/behavior
  try {
    const { data, error } = await supabaseAdmin.rpc('compute_vc_activity', { state_filter: 'MO', result_limit: 1 })
    results.compute_vc_activity = {
      ok: !error,
      error: error?.message,
      meta: { returnedRows: Array.isArray(data) ? data.length : null },
    }
  } catch (e: any) {
    results.compute_vc_activity = { ok: false, error: e?.message || String(e) }
  }

  // Vertex AI reachability
  try {
    const aiService = createAIService()
    if (!aiService) {
      results.vertex = { ok: false, error: 'Vertex AI credentials missing' }
    } else {
      const embedding = await aiService.generateEmbedding('health check text')
      const sample = embedding.embedding.slice(0, 3)
      results.vertex = { ok: Array.isArray(embedding.embedding), meta: { dimensions: embedding.embedding.length, preview: sample } }
    }
  } catch (e: any) {
    results.vertex = { ok: false, error: e?.message || String(e) }
  }

  return NextResponse.json({ ok: Object.values(results).every((r) => r.ok), results })
}
