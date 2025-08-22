/**
 * Check actual table schemas to understand column names
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTableSchemas() {
  console.log('🔍 Checking actual table schemas...\n')
  
  const tables = ['ria_profiles', 'narratives', 'control_persons', 'ria_private_funds']
  
  for (const tableName of tables) {
    console.log(`📋 Table: ${tableName}`)
    
    try {
      // Get a sample record to see the actual column structure
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1)
      
      if (error) {
        console.log(`   ❌ Error: ${error.message}`)
      } else if (data && data.length > 0) {
        const columns = Object.keys(data[0])
        console.log(`   ✅ Columns (${columns.length}):`)
        columns.forEach(col => {
          const value = data[0][col]
          const type = typeof value
          const preview = value !== null ? String(value).substring(0, 50) : 'null'
          console.log(`      - ${col}: ${type} (${preview}...)`)
        })
      } else {
        console.log('   ⚠️  Table exists but no data found')
      }
    } catch (err) {
      console.log(`   ❌ Exception: ${err.message}`)
    }
    
    console.log('')
  }
  
  // Also check narratives structure specifically since it was working
  console.log('🧬 Detailed narratives structure:')
  try {
    const { data, error } = await supabase
      .from('narratives')
      .select('*')
      .limit(2)
    
    if (error) {
      console.log(`❌ Error: ${error.message}`)
    } else if (data && data.length > 0) {
      console.log('✅ Sample narratives records:')
      data.forEach((record, index) => {
        console.log(`   Record ${index + 1}:`)
        Object.entries(record).forEach(([key, value]) => {
          if (key === 'embedding_vector' && value) {
            console.log(`      ${key}: [vector with ${value.length || 'unknown'} dimensions]`)
          } else {
            const preview = value !== null ? String(value).substring(0, 100) : 'null'
            console.log(`      ${key}: ${preview}${String(value).length > 100 ? '...' : ''}`)
          }
        })
        console.log('')
      })
    }
  } catch (err) {
    console.log(`❌ Exception: ${err.message}`)
  }
}

checkTableSchemas().catch(console.error)
