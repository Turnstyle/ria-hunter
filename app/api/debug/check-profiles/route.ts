import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    // Test the specific profiles the frontend needs
    const testIds = [29880, 51, 423, 162262, 1331]
    const results = []
    
    for (const id of testIds) {
      const { data, error } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state')
        .eq('crd_number', id)
        .single()
      
      results.push({
        crd_number: id,
        found: !!data,
        data: data || null,
        error: error?.message || null
      })
    }

    // Also get total count
    const { count } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      total_profiles: count,
      test_results: results,
      timestamp: new Date().toISOString(),
      database_url: process.env.SUPABASE_URL?.substring(0, 30) + '...'
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
