import { supabaseAdmin } from './lib/supabaseAdmin'

async function testDirectQueries() {
  console.log('🔍 Testing direct Supabase queries...\n')
  
  // Test the exact queries the API is using
  const testCRDs = [29880, 336188, 286381]
  
  for (const crd of testCRDs) {
    console.log(`\n📍 Testing CRD ${crd}:`)
    
    // Test as string (what URL provides)
    const stringQuery = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('crd_number', String(crd))
      .single()
    
    console.log(`  String query:`, {
      found: !!stringQuery.data,
      error: stringQuery.error?.message,
      data: stringQuery.data || null
    })
    
    // Test as number
    const numberQuery = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('crd_number', crd)
      .single()
    
    console.log(`  Number query:`, {
      found: !!numberQuery.data,
      error: numberQuery.error?.message,
      data: numberQuery.data || null
    })
    
    // Test with multiple results (not .single())
    const multiQuery = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('crd_number', crd)
    
    console.log(`  Multi query:`, {
      found: !!multiQuery.data,
      count: multiQuery.data?.length || 0,
      error: multiQuery.error?.message,
      data: multiQuery.data || null
    })
  }
  
  // Check total records
  const { count } = await supabaseAdmin
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n📊 Total records in ria_profiles: ${count}`)
}

testDirectQueries().catch(console.error)
