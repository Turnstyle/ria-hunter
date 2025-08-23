/**
 * Test basic vector search functionality
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testBasicVectorSearch() {
  console.log('🧪 Testing basic vector search functionality...\n')
  
  try {
    // Test 1: Check table structure
    console.log('1️⃣ Checking narratives table structure...')
    const { data: sample, error: sampleError } = await supabase
      .from('narratives')
      .select('id, crd_number, embedding, embedding_vector')
      .limit(1)
    
    if (sampleError) {
      console.log('  ❌ Error:', sampleError.message)
      return
    }
    
    if (!sample || sample.length === 0) {
      console.log('  ❌ No data found in narratives table')
      return
    }
    
    const record = sample[0]
    console.log('  ✅ Table exists with columns:')
    console.log('    - id:', typeof record.id)
    console.log('    - crd_number:', typeof record.crd_number)
    console.log('    - embedding:', typeof record.embedding, record.embedding ? '(present)' : '(null)')
    console.log('    - embedding_vector:', typeof record.embedding_vector, record.embedding_vector ? '(present)' : '(null)')
    
    // Test 2: Check how many records have embedding_vector
    console.log('\n2️⃣ Checking embedding_vector coverage...')
    const { count: totalCount, error: totalError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const { count: vectorCount, error: vectorError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding_vector', 'is', null)
    
    if (totalError || vectorError) {
      console.log('  ❌ Error counting records')
    } else {
      console.log(`  📊 Total narratives: ${totalCount?.toLocaleString()}`)
      console.log(`  📊 With embedding_vector: ${vectorCount?.toLocaleString()}`)
      console.log(`  📊 Coverage: ${((vectorCount / totalCount) * 100).toFixed(1)}%`)
    }
    
    // Test 3: Check for existing vector search functions
    console.log('\n3️⃣ Checking existing RPC functions...')
    
    const functionsToCheck = ['match_narratives', 'search_rias', 'hybrid_search_rias']
    
    for (const funcName of functionsToCheck) {
      try {
        // Test if function exists by calling it with minimal params
        const testParams = funcName === 'match_narratives' 
          ? { query_embedding: Array(768).fill(0.1), match_count: 1 }
          : funcName === 'search_rias'
          ? { query_embedding: Array(768).fill(0.1), match_count: 1 }
          : { query_text: 'test', query_embedding: Array(768).fill(0.1), match_count: 1 }
        
        const { data, error } = await supabase.rpc(funcName, testParams)
        
        if (error) {
          console.log(`  ❌ ${funcName}: ${error.message}`)
        } else {
          console.log(`  ✅ ${funcName}: Working (${data?.length || 0} results)`)
        }
      } catch (err) {
        console.log(`  ❌ ${funcName}: ${err.message}`)
      }
    }
    
    // Test 4: Try basic vector similarity calculation
    console.log('\n4️⃣ Testing manual vector similarity...')
    
    if (vectorCount > 0) {
      try {
        const { data: vectorRecords, error: vectorRecordsError } = await supabase
          .from('narratives')
          .select('id, crd_number, narrative, embedding_vector')
          .not('embedding_vector', 'is', null)
          .limit(3)
        
        if (vectorRecordsError) {
          console.log('  ❌ Error fetching vector records:', vectorRecordsError.message)
        } else {
          console.log(`  ✅ Found ${vectorRecords.length} records with vectors`)
          
          // Try to examine the vector format
          const firstVector = vectorRecords[0].embedding_vector
          if (firstVector) {
            console.log('  📊 First vector type:', typeof firstVector)
            console.log('  📊 First vector sample:', String(firstVector).substring(0, 100) + '...')
            
            if (Array.isArray(firstVector)) {
              console.log('  📊 Vector dimensions:', firstVector.length)
            }
          }
        }
      } catch (err) {
        console.log('  ❌ Error testing vectors:', err.message)
      }
    }
    
    // Test 5: Check for HNSW index
    console.log('\n5️⃣ Checking for vector indexes...')
    try {
      // This is a workaround to check indexes without direct SQL access
      const { data: profileSample } = await supabase
        .from('ria_profiles')
        .select('id, crd_number, embedding_768')
        .not('embedding_768', 'is', null)
        .limit(1)
      
      if (profileSample && profileSample.length > 0) {
        console.log('  ✅ ria_profiles has embedding_768 column')
        console.log('  📊 Vector type:', typeof profileSample[0].embedding_768)
      } else {
        console.log('  ❌ No embedding_768 data found in ria_profiles')
      }
    } catch (err) {
      console.log('  ❌ Error checking ria_profiles vectors:', err.message)
    }
    
  } catch (error) {
    console.error('💥 Fatal error during testing:', error)
  }
}

testBasicVectorSearch()
  .then(() => {
    console.log('\n✅ Basic vector search test complete')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Failed basic vector search test:', error)
    process.exit(1)
  })
