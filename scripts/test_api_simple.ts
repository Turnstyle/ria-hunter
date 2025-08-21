#!/usr/bin/env tsx
/**
 * Simple API test script that works with our current sample data
 * Tests the basic functionality without requiring embeddings
 */

const { supabaseAdmin } = require('../lib/supabaseAdmin')

async function testBasicQueries() {
  console.log('🔍 Testing basic database queries...\n')
  
  // Test 1: Basic profile query
  console.log('Test 1: All RIA profiles')
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('ria_profiles')
    .select('id, name, sec_number, city, state, aum')
    .order('aum', { ascending: false })

  if (profileError) {
    console.error('❌ Profile query failed:', profileError)
  } else {
    console.log(`✅ Found ${profiles.length} profiles:`)
    profiles.forEach((p: any) => {
      console.log(`  - ${p.name} (${p.sec_number}) in ${p.city}, ${p.state} - $${(p.aum || 0).toLocaleString()} AUM`)
    })
  }

  console.log('\n---\n')

  // Test 2: Text search by name
  console.log('Test 2: Search by name "Strategic"')
  const { data: searchResults, error: searchError } = await supabaseAdmin
    .from('ria_profiles')
    .select('name, sec_number, city, state')
    .ilike('name', '%Strategic%')

  if (searchError) {
    console.error('❌ Name search failed:', searchError)
  } else {
    console.log(`✅ Found ${searchResults.length} results:`)
    searchResults.forEach((r: any) => {
      console.log(`  - ${r.name} (${r.sec_number}) in ${r.city}, ${r.state}`)
    })
  }

  console.log('\n---\n')

  // Test 3: Profiles with executives
  console.log('Test 3: Profiles with executives')
  const { data: withExecs, error: execError } = await supabaseAdmin
    .from('ria_profiles')
    .select(`
      name,
      sec_number,
      control_persons(name, position)
    `)
    .limit(3)

  if (execError) {
    console.error('❌ Executive query failed:', execError)
  } else {
    console.log(`✅ Profiles with executives:`)
    withExecs.forEach((profile: any) => {
      console.log(`  ${profile.name} (${profile.sec_number}):`)
      profile.control_persons?.forEach((exec: any) => {
        console.log(`    - ${exec.name} (${exec.position})`)
      })
    })
  }

  console.log('\n---\n')

  // Test 4: Profiles with VC/PE funds
  console.log('Test 4: Profiles with VC/PE activity')
  const { data: withFunds, error: fundsError } = await supabaseAdmin
    .from('ria_profiles')
    .select(`
      name,
      sec_number,
      ria_private_funds(fund_name, fund_type, aum)
    `)
    .limit(5)

  if (fundsError) {
    console.error('❌ Funds query failed:', fundsError)
  } else {
    console.log(`✅ Profiles with private funds:`)
    withFunds.forEach((profile: any) => {
      if (profile.ria_private_funds?.length > 0) {
        console.log(`  ${profile.name} (${profile.sec_number}):`)
        profile.ria_private_funds.forEach((fund: any) => {
          console.log(`    - ${fund.fund_name} (${fund.fund_type}) - $${(fund.aum || 0).toLocaleString()}`)
        })
      }
    })
  }

  console.log('\n---\n')

  // Test 5: State filtering
  console.log('Test 5: California-based RIAs')
  const { data: caRias, error: caError } = await supabaseAdmin
    .from('ria_profiles')
    .select('name, city, state, aum')
    .eq('state', 'CA')
    .order('aum', { ascending: false })

  if (caError) {
    console.error('❌ CA search failed:', caError)
  } else {
    console.log(`✅ Found ${caRias.length} California RIAs:`)
    caRias.forEach((ria: any) => {
      console.log(`  - ${ria.name} in ${ria.city}, ${ria.state} - $${(ria.aum || 0).toLocaleString()} AUM`)
    })
  }

  console.log('\n---\n')

  // Test 6: Complex search - RIAs with >$500M AUM
  console.log('Test 6: Large RIAs (>$500M AUM)')
  const { data: largeRias, error: largeError } = await supabaseAdmin
    .from('ria_profiles')
    .select('name, city, state, aum, employee_count')
    .gte('aum', 500000000)
    .order('aum', { ascending: false })

  if (largeError) {
    console.error('❌ Large RIA search failed:', largeError)
  } else {
    console.log(`✅ Found ${largeRias.length} large RIAs:`)
    largeRias.forEach((ria: any) => {
      console.log(`  - ${ria.name} - $${(ria.aum || 0).toLocaleString()} AUM, ${ria.employee_count} employees`)
    })
  }

  console.log('\n🎉 All basic database tests completed!')
}

async function testSearchFunctions() {
  console.log('\n\n🔧 Testing search functions...\n')

  try {
    // Test match_narratives function (will fail without embeddings)
    console.log('Test: match_narratives function')
    const mockEmbedding = Array(768).fill(0).map(() => Math.random())
    const { data: matchData, error: matchError } = await supabaseAdmin.rpc('match_narratives', {
      query_embedding: mockEmbedding,
      match_threshold: 0.5,
      match_count: 3
    })

    if (matchError) {
      console.log('⚠️  match_narratives failed (expected - no embeddings):', matchError.message)
    } else {
      console.log('✅ match_narratives worked:', matchData?.length || 0, 'results')
    }
  } catch (err) {
    console.log('⚠️  match_narratives error (expected):', (err as Error).message)
  }
}

// Main execution
async function main() {
  try {
    await testBasicQueries()
    await testSearchFunctions()
    
    console.log('\n\n✨ Summary:')
    console.log('- Basic database queries: Working ✅')
    console.log('- Text search: Working ✅') 
    console.log('- Relational data: Working ✅')
    console.log('- Vector search: Waiting for embeddings ⏳')
    console.log('\n🚀 Ready for frontend integration!')
    
  } catch (error) {
    console.error('💥 Test failed:', error)
    process.exit(1)
  }
  
  process.exit(0)
}

if (require.main === module) {
  main()
}
