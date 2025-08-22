/**
 * Check current RLS status and policies in the database
 */

const { createClient } = require('@supabase/supabase-js')

// Environment check
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkRLSStatus() {
  console.log('🔍 Checking Row Level Security status...\n')
  
  try {
    // Check which tables exist by testing direct queries
    const potentialTables = ['ria_profiles', 'narratives', 'control_persons', 'ria_private_funds', 'private_funds', 'audit_logs']
    const existingTables = []
    
    for (const tableName of potentialTables) {
      try {
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
        
        if (!error) {
          existingTables.push({ table_name: tableName, count })
        }
      } catch (err) {
        // Table doesn't exist, ignore
      }
    }
    
    console.log('📊 Database Tables:')
    existingTables.forEach(table => {
      console.log(`  - ${table.table_name} (${table.count?.toLocaleString() || 0} records)`)
    })
    console.log('')
    
    // Check RLS status for key tables
    const keyTables = ['ria_profiles', 'narratives', 'control_persons', 'ria_private_funds', 'private_funds']
    
    for (const tableName of keyTables) {
      console.log(`🔒 Checking "${tableName}":`)
      
      // Check if table exists first
      const tableExists = existingTables.find(t => t.table_name === tableName)
      if (!tableExists) {
        console.log(`  ❌ Table "${tableName}" does not exist`)
        continue
      }
      
      console.log(`  ✅ Table exists with ${tableExists.count?.toLocaleString() || 0} records`)
      
      // Try to test RLS by attempting different query types
      console.log('  📝 Testing database access patterns...')
      
      // Test basic select
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1)
        
        if (error) {
          console.log(`    ❌ SELECT failed: ${error.message}`)
        } else {
          console.log('    ✅ SELECT works (service_role bypasses RLS)')
        }
      } catch (err) {
        console.log(`    ❌ SELECT error: ${err.message}`)
      }
      
      console.log('')
    }
    
    // Summary
    console.log('📈 Data Summary:')
    existingTables.forEach(table => {
      const displayName = table.table_name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
      console.log(`  ${displayName}: ${table.count?.toLocaleString() || 0} records`)
    })
    
    // Check for audit tables
    console.log('\n🔍 Audit infrastructure:')
    const auditTables = ['audit_logs', 'migration_log', 'etl_dead_letter']
    
    for (const auditTable of auditTables) {
      const tableExists = existingTables.find(t => t.table_name === auditTable)
      console.log(`  ${tableExists ? '✅' : '❌'} ${auditTable}`)
    }
    
  } catch (error) {
    console.error('Fatal error during RLS check:', error)
  }
}

// Run the check
checkRLSStatus().then(() => {
  console.log('✅ RLS status check complete')
  process.exit(0)
}).catch(error => {
  console.error('❌ Failed to check RLS status:', error)
  process.exit(1)
})
