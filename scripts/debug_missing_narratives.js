/**
 * Debug script to understand the narrative mismatch
 * Check database state directly
 */

const { createClient } = require('@supabase/supabase-js')
const { validateEnvVars } = require('./load-env')

async function debugNarrativeState() {
  const { supabaseUrl, supabaseServiceKey } = validateEnvVars()
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  console.log('🔍 DEBUGGING NARRATIVE STATE')
  console.log('='.repeat(50))
  
  // Check total profiles
  const { count: totalProfiles } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
  
  // Check total narratives
  const { count: totalNarratives } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
  
  console.log(`📊 Database Counts:`)
  console.log(`   - Total RIA Profiles: ${totalProfiles?.toLocaleString()}`)
  console.log(`   - Total Narratives: ${totalNarratives?.toLocaleString()}`)
  console.log(`   - Missing: ${(totalProfiles - totalNarratives)?.toLocaleString()}`)
  
  // Sample some profiles that should need narratives
  const { data: sampleProfiles } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name')
    .limit(10)
  
  console.log(`\n📝 Sample Profile CRD Numbers:`)
  sampleProfiles?.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i+1}. CRD: ${p.crd_number} - ${p.legal_name}`)
  })
  
  // Check if these profiles have narratives
  const sampleCrds = sampleProfiles?.map(p => p.crd_number) || []
  const { data: narrativesForSample } = await supabase
    .from('narratives')
    .select('crd_number')
    .in('crd_number', sampleCrds)
  
  console.log(`\n🔍 Narratives Found for Sample:`)
  console.log(`   - Sample Size: ${sampleCrds.length}`)
  console.log(`   - Narratives Found: ${narrativesForSample?.length || 0}`)
  
  if (narrativesForSample?.length) {
    console.log(`   - CRDs with narratives: ${narrativesForSample.map(n => n.crd_number).join(', ')}`)
  }
  
  // Find profiles that definitely don't have narratives
  console.log(`\n🎯 Finding profiles WITHOUT narratives...`)
  
  // Get all narrative CRD numbers in smaller batches
  let allNarrativeCrds = new Set()
  let hasMore = true
  let offset = 0
  const batchSize = 5000
  
  while (hasMore) {
    const { data: narrativeBatch, error } = await supabase
      .from('narratives')
      .select('crd_number')
      .range(offset, offset + batchSize - 1)
    
    if (error) {
      console.error('Error fetching narratives:', error.message)
      break
    }
    
    if (!narrativeBatch || narrativeBatch.length === 0) {
      hasMore = false
    } else {
      narrativeBatch.forEach(n => allNarrativeCrds.add(n.crd_number))
      offset += batchSize
      hasMore = narrativeBatch.length === batchSize
      
      if (offset % 10000 === 0) {
        console.log(`   📊 Loaded ${allNarrativeCrds.size.toLocaleString()} narrative CRDs so far...`)
      }
    }
  }
  
  console.log(`   ✅ Loaded ${allNarrativeCrds.size.toLocaleString()} total narrative CRDs`)
  
  // Now find profiles that don't have narratives
  const { data: profilesWithoutNarratives } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name')
    .not('legal_name', 'is', null)
    .limit(100)
  
  const actuallyMissing = profilesWithoutNarratives?.filter(p => !allNarrativeCrds.has(p.crd_number)) || []
  
  console.log(`\n🎯 Actual Missing Narratives:`)
  console.log(`   - Checked: ${profilesWithoutNarratives?.length || 0} profiles`)
  console.log(`   - Missing: ${actuallyMissing.length}`)
  
  if (actuallyMissing.length > 0) {
    console.log(`   - First 5 missing:`)
    actuallyMissing.slice(0, 5).forEach((p, i) => {
      console.log(`     ${i+1}. CRD: ${p.crd_number} - ${p.legal_name}`)
    })
  } else {
    console.log(`   ⚠️ No missing narratives found in sample - this might explain the ETL issue`)
  }
}

debugNarrativeState().catch(console.error)
