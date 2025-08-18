import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    // Get database connection info
    const databaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    
    // Test database connectivity and get basic stats
    const { count: totalProfiles } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
    
    // Check for profiles with "N" values
    const { count: placeholderCount } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
      .in('legal_name', ['N', 'Y'])
    
    // Check specific test profiles
    const testResults = []
    const testIds = [29880, 51, 423, 162262, 1331, 286381]
    
    for (const id of testIds) {
      const { data, error } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state')
        .eq('crd_number', id)
        .single()
      
      testResults.push({
        crd_number: id,
        found: !!data,
        legal_name: data?.legal_name || null,
        city: data?.city || null,
        error: error?.message || null
      })
    }
    
    // Sample of actual data in database
    const { data: sampleData } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .not('legal_name', 'is', null)
      .limit(10)
    
    return NextResponse.json({
      connection_info: {
        database_url: databaseUrl?.substring(0, 50) + '...',
        has_service_key: hasServiceKey,
        url_project_id: databaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'
      },
      database_stats: {
        total_profiles: totalProfiles,
        placeholder_profiles: placeholderCount,
        percentage_placeholders: totalProfiles ? ((placeholderCount / totalProfiles) * 100).toFixed(1) + '%' : '0%'
      },
      test_profiles: testResults,
      sample_data: sampleData,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
