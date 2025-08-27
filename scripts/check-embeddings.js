const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkEmbeddingHealth() {
  console.log('🔍 Checking Database Embedding Health...\n')
  
  // 1. Check narratives table
  const { data: narrativeStats, error: narrativeError } = await supabase
    .rpc('get_narrative_stats')
    .single()
  
  if (narrativeError) {
    // Fallback to direct query
    const { count: totalNarratives } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const { count: withEmbedding } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null)
    
    console.log('📊 Narrative Statistics:')
    console.log(`   Total narratives: ${totalNarratives}`)
    console.log(`   With embeddings: ${withEmbedding}`)
    console.log(`   Coverage: ${((withEmbedding / totalNarratives) * 100).toFixed(1)}%`)
  } else {
    console.log('📊 Narrative Statistics:', narrativeStats)
  }
  
  // 2. Check RIA profiles
  const { count: totalProfiles } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n📊 RIA Profiles: ${totalProfiles}`)
  
  // 3. Check control persons
  const { count: totalControlPersons } = await supabase
    .from('control_persons')
    .select('*', { count: 'exact', head: true })
  
  console.log(`📊 Control Persons: ${totalControlPersons}`)
  
  // 4. Test match_narratives function
  console.log('\n🧪 Testing match_narratives RPC function...')
  
  // Create a test embedding (768 dimensions of 0.1)
  const testEmbedding = new Array(768).fill(0.1)
  
  const { data: testResults, error: testError } = await supabase
    .rpc('match_narratives', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 5
    })
  
  if (testError) {
    console.error('❌ match_narratives test failed:', testError.message)
  } else {
    console.log(`✅ match_narratives working! Returned ${testResults?.length || 0} results`)
  }
  
  // 5. Check for embedding dimension issues
  const { data: sampleNarrative } = await supabase
    .from('narratives')
    .select('crd_number, embedding')
    .not('embedding', 'is', null)
    .limit(1)
    .single()
  
  if (sampleNarrative?.embedding) {
    const embeddingArray = Array.isArray(sampleNarrative.embedding) 
      ? sampleNarrative.embedding 
      : JSON.parse(sampleNarrative.embedding)
    console.log(`\n📏 Embedding dimensions: ${embeddingArray.length}`)
    console.log(`   Expected: 768`)
    console.log(`   Match: ${embeddingArray.length === 768 ? '✅' : '❌'}`)
  }
  
  console.log('\n✅ Health check complete!')
}

// Run the check
checkEmbeddingHealth().catch(console.error)
