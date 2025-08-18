import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const crd = url.searchParams.get('crd') || '29880'
    
    console.log(`🔍 Debug Query Test for CRD: ${crd}`)
    
    const results = {
      test_crd: crd,
      environment: {
        url: process.env.SUPABASE_URL?.substring(0, 50) + '...',
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        node_env: process.env.NODE_ENV
      },
      queries: {}
    }
    
    // Test 1: String query (what the API route does)
    try {
      const { data, error, count } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state')
        .eq('crd_number', crd)
        .single()
      
      results.queries.string_query = {
        success: !error,
        found: !!data,
        error: error?.message || null,
        error_code: error?.code || null,
        data: data || null,
        query_type: 'string',
        input: crd,
        input_type: typeof crd
      }
    } catch (e: any) {
      results.queries.string_query = {
        success: false,
        error: e.message,
        query_type: 'string'
      }
    }
    
    // Test 2: Numeric query
    const numericCrd = parseInt(crd, 10)
    if (!isNaN(numericCrd)) {
      try {
        const { data, error } = await supabaseAdmin
          .from('ria_profiles')
          .select('crd_number, legal_name, city, state')
          .eq('crd_number', numericCrd)
          .single()
        
        results.queries.numeric_query = {
          success: !error,
          found: !!data,
          error: error?.message || null,
          error_code: error?.code || null,
          data: data || null,
          query_type: 'number',
          input: numericCrd,
          input_type: typeof numericCrd
        }
      } catch (e: any) {
        results.queries.numeric_query = {
          success: false,
          error: e.message,
          query_type: 'number'
        }
      }
    }
    
    // Test 3: Multi-query (no .single())
    try {
      const { data, error } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state')
        .eq('crd_number', crd)
      
      results.queries.multi_query = {
        success: !error,
        count: data?.length || 0,
        error: error?.message || null,
        data: data || null,
        query_type: 'multi'
      }
    } catch (e: any) {
      results.queries.multi_query = {
        success: false,
        error: e.message,
        query_type: 'multi'
      }
    }
    
    // Test 4: Table stats
    try {
      const { count } = await supabaseAdmin
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
      
      results.table_stats = { total_records: count }
    } catch (e: any) {
      results.table_stats = { error: e.message }
    }
    
    return NextResponse.json(results)
    
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
