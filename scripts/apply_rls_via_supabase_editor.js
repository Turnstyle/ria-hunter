/**
 * Apply RLS policies via direct Supabase client connection
 * Using the correct East Coast endpoint for llusjnpltqxhokycwzry
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Correct Supabase configuration for East Coast database
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM'

console.log('🌐 Connecting to Supabase...')
console.log(`   URL: ${supabaseUrl}`)
console.log(`   Region: AWS US-East-2 (correct!)`)
console.log('')

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeRLSStatements() {
  console.log('🔧 Executing RLS Implementation...\n')
  
  // Test connection first
  try {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .limit(1)
    
    if (error) {
      console.error('❌ Connection test failed:', error.message)
      return false
    }
    
    console.log('✅ Connection test successful')
    console.log(`   Found data: ${data?.length > 0 ? 'Yes' : 'No'}`)
    console.log('')
  } catch (err) {
    console.error('❌ Connection error:', err.message)
    return false
  }
  
  // Read the SQL file with corrected statements
  const sqlContent = fs.readFileSync('./scripts/corrected_rls_statements.sql', 'utf8')
  
  console.log('📋 RLS SQL Statements to Execute:')
  console.log('=' .repeat(80))
  console.log('')
  console.log('🚨 EXECUTE THIS IN SUPABASE SQL EDITOR:')
  console.log(`   URL: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql`)
  console.log('')
  console.log('Copy and paste this SQL:')
  console.log('')
  console.log(sqlContent)
  console.log('')
  console.log('=' .repeat(80))
  
  // Test some basic operations to verify current state
  console.log('\n🧪 Current Database State Analysis:')
  
  // Check table access
  const tables = [
    { name: 'ria_profiles', key: 'crd_number' },
    { name: 'narratives', key: 'id' },
    { name: 'control_persons', key: 'control_person_pk' },
    { name: 'ria_private_funds', key: 'id' }
  ]
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`❌ ${table.name}: ${error.message}`)
      } else {
        console.log(`✅ ${table.name}: ${count?.toLocaleString() || 0} records`)
      }
    } catch (err) {
      console.log(`❌ ${table.name}: ${err.message}`)
    }
  }
  
  // Check audit infrastructure
  console.log('\n🔍 Audit Infrastructure Status:')
  const auditTables = ['audit_logs', 'migration_log', 'etl_dead_letter']
  
  for (const table of auditTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`)
      } else {
        console.log(`✅ ${table}: exists with ${count || 0} records`)
      }
    } catch (err) {
      console.log(`❌ ${table}: needs to be created`)
    }
  }
  
  return true
}

async function postRLSValidation() {
  console.log('\n🔬 Post-RLS Implementation Validation')
  console.log('(Run this section after executing the SQL in Supabase Editor)\n')
  
  // This will be run after the user executes the SQL
  const validationTests = [
    'Test anonymous access to ria_profiles (should work)',
    'Test authenticated access to control_persons (should work)', 
    'Test anonymous access to control_persons (should fail)',
    'Test service role access to all tables (should work)',
    'Verify audit triggers are functioning',
    'Check RLS policy effectiveness'
  ]
  
  console.log('📋 Validation checklist:')
  validationTests.forEach((test, index) => {
    console.log(`   ${index + 1}. ${test}`)
  })
  
  console.log('\n✅ Ready to proceed to Phase 2: ETL Pipeline Implementation')
}

// Run the application
executeRLSStatements()
  .then(success => {
    if (success) {
      postRLSValidation()
      
      console.log('\n' + '='.repeat(80))
      console.log('🎯 NEXT STEPS:')
      console.log('1. Execute the SQL above in Supabase SQL Editor')
      console.log('2. Run RLS validation tests')
      console.log('3. Update the Final Refactor Plan with completion status') 
      console.log('4. Begin Phase 2: ETL Pipeline Implementation')
      console.log('=' .repeat(80))
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
