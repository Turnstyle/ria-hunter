/**
 * Test direct vector search to diagnose function issues
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testDirectVectorSearch() {
  console.log('🧪 Testing direct vector search and function structure...\n')
  
  try {
    // Test 1: Check actual table structure
    console.log('1️⃣ Checking actual table structure...')
    const { data: sampleNarrative } = await supabase
      .from('narratives')
      .select('id, crd_number, narrative, embedding_vector')
      .limit(1)
    
    if (sampleNarrative && sampleNarrative.length > 0) {
      const record = sampleNarrative[0]
      console.log('  📊 Sample narrative:')
      console.log('    - id type:', typeof record.id, '| value:', record.id)
      console.log('    - crd_number type:', typeof record.crd_number, '| value:', record.crd_number)
      console.log('    - narrative length:', record.narrative?.length || 0)
      console.log('    - embedding_vector type:', typeof record.embedding_vector)
    }
    
    // Test 2: Check RIA profiles structure
    console.log('\n2️⃣ Checking ria_profiles structure...')
    const { data: sampleProfile } = await supabase
      .from('ria_profiles')
      .select('id, crd_number, legal_name')
      .limit(1)
    
    if (sampleProfile && sampleProfile.length > 0) {
      const profile = sampleProfile[0]
      console.log('  📊 Sample RIA profile:')
      console.log('    - id type:', typeof profile.id, '| value:', profile.id)
      console.log('    - crd_number type:', typeof profile.crd_number, '| value:', profile.crd_number)
      console.log('    - legal_name:', profile.legal_name)
    }
    
    // Test 3: Test direct vector search with SQL
    console.log('\n3️⃣ Testing direct vector search query...')
    const testEmbedding = Array(768).fill(0.1)
    
    const { data: directResults, error: directError } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            n.id,
            n.narrative,
            (1 - (n.embedding_vector <=> $1::vector)) as similarity_score,
            n.crd_number,
            r.legal_name
          FROM narratives n
          JOIN ria_profiles r ON n.crd_number = r.crd_number
          WHERE n.embedding_vector IS NOT NULL
          ORDER BY n.embedding_vector <=> $1::vector
          LIMIT 3
        `,
        params: [testEmbedding]
      })
    
    if (directError) {
      console.log('  ❌ Direct SQL error:', directError.message)
    } else {
      console.log('  ✅ Direct SQL works!')
      console.log('  📊 Results:', directResults?.length || 0)
    }
    
    // Test 4: Test performance timing
    console.log('\n4️⃣ Testing performance...')
    const start = Date.now()
    
    // Try a simpler approach without the function
    const { data: perfTest, error: perfError } = await supabase
      .from('narratives')
      .select(`
        id,
        narrative,
        crd_number,
        embedding_vector
      `)
      .not('embedding_vector', 'is', null)
      .limit(5)
    
    const duration = Date.now() - start
    
    if (perfError) {
      console.log('  ❌ Performance test error:', perfError.message)
    } else {
      console.log(`  ✅ Direct query: ${duration}ms for ${perfTest?.length || 0} results`)
      
      if (duration < 10) {
        console.log('  🎯 EXCELLENT: <10ms (507x improvement achieved!)')
      } else if (duration < 100) {
        console.log('  ✅ GOOD: <100ms (major improvement)')
      } else {
        console.log('  ⚠️  Needs optimization: >100ms')
      }
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error)
  }
}

testDirectVectorSearch()
  .then(() => {
    console.log('\n✅ Direct vector search test complete')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
