#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testMissouriFix() {
  console.log('🔧 Testing Missouri RIA Search Fix...\n')
  
  // Create a test embedding
  const testEmbedding = new Array(768).fill(0.1)
  
  console.log('1️⃣ Testing search_rias with Missouri filter:')
  const { data: searchResults, error: searchError } = await supabase.rpc('search_rias', {
    query_embedding: testEmbedding,
    match_threshold: 0.0,
    match_count: 20,
    state_filter: 'MO',
    min_vc_activity: 0,
    min_aum: 0
  })
  
  if (searchError) {
    console.log(`  ❌ Error: ${searchError.message}`)
  } else {
    console.log(`  ✅ Results: ${searchResults?.length || 0} firms found`)
    if (searchResults && searchResults.length > 0) {
      console.log('  Top 5 results:')
      searchResults.slice(0, 5).forEach(r => {
        console.log(`    - ${r.legal_name} (${r.city}, ${r.state}) - AUM: $${(r.aum / 1000000).toFixed(2)}M`)
      })
    }
  }
  
  console.log('\n2️⃣ Testing hybrid_search_rias with Missouri filter:')
  const { data: hybridResults, error: hybridError } = await supabase.rpc('hybrid_search_rias', {
    query_text: 'investment advisor',
    query_embedding: testEmbedding,
    match_threshold: 0.0,
    match_count: 20,
    state_filter: 'MO',
    min_vc_activity: 0,
    min_aum: 0
  })
  
  if (hybridError) {
    console.log(`  ❌ Error: ${hybridError.message}`)
  } else {
    console.log(`  ✅ Results: ${hybridResults?.length || 0} firms found`)
    if (hybridResults && hybridResults.length > 0) {
      console.log('  Top 5 results:')
      hybridResults.slice(0, 5).forEach(r => {
        console.log(`    - ${r.legal_name} (${r.city}, ${r.state}) - AUM: $${(r.aum / 1000000).toFixed(2)}M`)
      })
    }
  }
  
  // Test API endpoint directly
  console.log('\n3️⃣ Testing /api/ask endpoint with Missouri filter:')
  const apiUrl = `${supabaseUrl.replace('.supabase.co', '-api.vercel.app')}/api/ask`
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'Find RIAs in Missouri',
        state: 'MO',
        maxResults: 20
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log(`  ✅ API returned ${data.results?.length || 0} results`)
      if (data.results && data.results.length > 0) {
        console.log('  Sample results:')
        data.results.slice(0, 3).forEach(r => {
          console.log(`    - ${r.legal_name} (${r.city}, ${r.state})`)
        })
      }
    } else {
      console.log(`  ❌ API error: ${response.status} ${response.statusText}`)
    }
  } catch (err) {
    console.log(`  ⚠️ Could not test API endpoint directly: ${err.message}`)
  }
  
  // Test specific known Missouri firms
  console.log('\n4️⃣ Testing search for specific Missouri firms:')
  const knownMissouriFirms = [
    { name: 'SIXTHIRTY VENTURES', crd: 1728333 },
    { name: 'EDWARD JONES', crd: 250 },
    { name: 'STIFEL NICOLAUS', crd: 793 }
  ]
  
  for (const firm of knownMissouriFirms) {
    const { data: searchResult } = await supabase.rpc('hybrid_search_rias', {
      query_text: firm.name,
      query_embedding: testEmbedding,
      match_threshold: 0.0,
      match_count: 5,
      state_filter: 'MO',
      min_vc_activity: 0,
      min_aum: 0
    })
    
    const found = searchResult?.find(r => r.legal_name?.toUpperCase().includes(firm.name))
    if (found) {
      console.log(`  ✅ Found: ${firm.name}`)
    } else {
      console.log(`  ❌ Not found: ${firm.name} (CRD: ${firm.crd})`)
    }
  }
  
  console.log('\n✅ Test complete!')
  
  // Summary
  console.log('\n📊 SUMMARY:')
  console.log('='.repeat(50))
  
  const hasSearchResults = searchResults && searchResults.length > 0
  const hasHybridResults = hybridResults && hybridResults.length > 0
  
  if (hasSearchResults && hasHybridResults) {
    console.log('✅ Missouri RIA search is WORKING!')
    console.log(`  - search_rias returns ${searchResults.length} results`)
    console.log(`  - hybrid_search_rias returns ${hybridResults.length} results`)
  } else {
    console.log('❌ Missouri RIA search still has issues:')
    if (!hasSearchResults) {
      console.log('  - search_rias returns no results')
    }
    if (!hasHybridResults) {
      console.log('  - hybrid_search_rias returns no results')
    }
    console.log('\n⚠️ You need to apply the SQL fix in MISSOURI_RIA_SEARCH_FIX.sql to Supabase')
  }
}

testMissouriFix().catch(console.error)
