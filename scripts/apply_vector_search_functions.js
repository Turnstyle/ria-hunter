/**
 * Apply proper vector search functions to database
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyVectorSearchFunctions() {
  console.log('🔧 Applying proper vector search functions...\n')
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_proper_vector_search_functions.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded, size:', (sql.length / 1024).toFixed(1), 'KB')
    
    // Split SQL into individual statements (rough approach)
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    console.log('📝 Found', statements.length, 'SQL statements to execute\n')
    
    let successCount = 0
    let errorCount = 0
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.length < 10) continue // Skip very short statements
      
      const preview = statement.substring(0, 60).replace(/\n/g, ' ') + '...'
      console.log(`[${i + 1}/${statements.length}] ${preview}`)
      
      try {
        const { error } = await supabase.rpc('exec', {
          sql: statement
        })
        
        if (error) {
          console.log('  ❌ Error:', error.message)
          errorCount++
        } else {
          console.log('  ✅ Success')
          successCount++
        }
      } catch (err) {
        console.log('  ❌ Exception:', err.message)
        errorCount++
      }
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log('\n📊 Summary:')
    console.log(`  ✅ Successful: ${successCount}`)
    console.log(`  ❌ Failed: ${errorCount}`)
    
    if (errorCount === 0) {
      console.log('\n🎉 All vector search functions applied successfully!')
      
      // Test the functions
      console.log('\n🧪 Testing vector search functions...')
      await testVectorSearchFunctions()
    } else {
      console.log('\n⚠️  Some statements failed. Check errors above.')
    }
    
  } catch (error) {
    console.error('💥 Fatal error applying vector functions:', error)
  }
}

async function testVectorSearchFunctions() {
  try {
    // Test 1: Check if functions exist
    console.log('\n1️⃣ Testing function existence...')
    
    const functions = ['search_rias', 'match_narratives', 'hybrid_search_rias', 'check_vector_indexes']
    
    for (const funcName of functions) {
      try {
        const { data, error } = await supabase.rpc('exec', {
          sql: `SELECT proname FROM pg_proc WHERE proname = '${funcName}';`
        })
        
        if (error || !data || data.length === 0) {
          console.log(`  ❌ ${funcName}: Not found`)
        } else {
          console.log(`  ✅ ${funcName}: Exists`)
        }
      } catch (err) {
        console.log(`  ❌ ${funcName}: Error checking`)
      }
    }
    
    // Test 2: Check vector indexes
    console.log('\n2️⃣ Checking vector indexes...')
    try {
      const { data, error } = await supabase.rpc('check_vector_indexes')
      
      if (error) {
        console.log('  ❌ Error checking indexes:', error.message)
      } else if (data && data.length > 0) {
        console.log('  📊 Vector indexes found:')
        data.forEach(idx => {
          console.log(`    - ${idx.table_name}.${idx.column_name} (${idx.index_type})`)
        })
      } else {
        console.log('  ⚠️  No vector indexes found')
      }
    } catch (err) {
      console.log('  ❌ Error testing index function:', err.message)
    }
    
    // Test 3: Test narrative search with dummy embedding
    console.log('\n3️⃣ Testing narrative search...')
    try {
      const testEmbedding = Array(768).fill(0.1) // Dummy 768-dimensional vector
      
      const startTime = Date.now()
      const { data, error } = await supabase.rpc('match_narratives', {
        query_embedding: testEmbedding,
        match_threshold: 0.5,
        match_count: 3
      })
      const duration = Date.now() - startTime
      
      if (error) {
        console.log('  ❌ Error:', error.message)
      } else {
        console.log(`  ✅ Success! Found ${data?.length || 0} results in ${duration}ms`)
        if (duration < 10) {
          console.log('  🚀 EXCELLENT performance (<10ms)')
        } else if (duration < 100) {
          console.log('  ✅ Good performance (<100ms)')
        } else {
          console.log('  ⚠️  Slow performance - needs optimization')
        }
      }
    } catch (err) {
      console.log('  ❌ Exception testing search:', err.message)
    }
    
    // Test 4: Performance monitoring
    console.log('\n4️⃣ Running performance check...')
    try {
      const { data, error } = await supabase.rpc('check_vector_search_performance')
      
      if (error) {
        console.log('  ❌ Error:', error.message)
      } else if (data && data.length > 0) {
        console.log('  📈 Performance results:')
        data.forEach(result => {
          console.log(`    - ${result.function_name}: ${result.avg_duration_ms}ms (${result.test_status})`)
        })
      }
    } catch (err) {
      console.log('  ❌ Error testing performance:', err.message)
    }
    
  } catch (error) {
    console.error('💥 Error during testing:', error)
  }
}

// Run the application
applyVectorSearchFunctions()
  .then(() => {
    console.log('\n✅ Vector search function application complete')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Failed to apply vector search functions:', error)
    process.exit(1)
  })
