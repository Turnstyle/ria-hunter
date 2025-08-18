import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    // Check profile count
    const { count } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })

    // Check specific profiles
    const { data: testProfiles } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .in('crd_number', [29880, 51, 423])
      .limit(5)

    // Check if CIK column exists
    let cikColumnExists = false;
    try {
      await supabaseAdmin
        .from('ria_profiles')
        .select('cik')
        .limit(1)
      cikColumnExists = true;
    } catch (err: any) {
      cikColumnExists = false;
    }

    return NextResponse.json({
      totalProfiles: count,
      cikColumnExists,
      testProfiles: testProfiles || [],
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
