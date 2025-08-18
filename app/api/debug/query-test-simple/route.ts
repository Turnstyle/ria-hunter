import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    console.log('🔍 Debug query test body:', body)
    
    if (!body || !body.crd_number) {
      return NextResponse.json({ error: 'Need crd_number in body' }, { status: 400 })
    }

    const { crd_number } = body
    console.log(`🎯 Testing exact match for: ${crd_number}`)

    // Test CRD lookup
    const numericCrd = parseInt(crd_number, 10)
    console.log(`🔢 Numeric CRD: ${numericCrd}`)
    
    const { data: crdProfile, error: crdError } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, cik')
      .eq('crd_number', numericCrd)
      .single()
    
    console.log(`📊 CRD query result:`, { 
      found: !!crdProfile, 
      error: crdError?.message,
      data: crdProfile 
    })

    return NextResponse.json({
      input: { crd_number, numericCrd },
      crd_query: {
        found: !!crdProfile,
        error: crdError?.message || null,
        data: crdProfile || null
      },
      success: !!crdProfile
    })

  } catch (error: any) {
    console.error('Debug query error:', error)
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
