import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    console.log('Testing lookup for CRD 29880...')
    
    // Test 1: Direct CRD lookup
    const { data: crdResult, error: crdError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', 29880)
      .single()
    
    console.log('CRD lookup result:', crdResult, crdError)
    
    // Test 2: Try CIK lookup (this might fail)
    let cikResult = null
    let cikError = null
    try {
      const result = await supabaseAdmin
        .from('ria_profiles')
        .select('*')
        .eq('cik', '29880')
        .single()
      cikResult = result.data
      cikError = result.error
    } catch (err) {
      cikError = err
    }
    
    console.log('CIK lookup result:', cikResult, cikError)
    
    // Test 3: Get schema info
    const { data: schemaResult } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, cik')
      .eq('crd_number', 29880)
      .single()
    
    return NextResponse.json({
      identifier: '29880',
      tests: {
        crd_lookup: {
          found: !!crdResult,
          data: crdResult,
          error: crdError?.message || null
        },
        cik_lookup: {
          found: !!cikResult,
          data: cikResult,
          error: cikError?.message || null
        },
        schema_check: {
          data: schemaResult
        }
      },
      database_url: process.env.SUPABASE_URL?.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
