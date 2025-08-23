/**
 * Check current database schema to understand exact column types and names
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkCurrentSchema() {
  console.log('🔍 CHECKING CURRENT DATABASE SCHEMA')
  console.log('='.repeat(50))
  
  try {
    // Check narratives table schema
    console.log('\n📋 NARRATIVES TABLE SCHEMA:')
    const { data: narrativesSchema, error: narrativesError } = await supabase.rpc('exec', {
      sql: `
        SELECT column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'narratives' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `
    })
    
    if (narrativesError) {
      console.log('❌ Error checking narratives schema:', narrativesError)
    } else {
      console.table(narrativesSchema)
    }
    
    // Check ria_profiles table schema
    console.log('\n📋 RIA_PROFILES TABLE SCHEMA:')
    const { data: profilesSchema, error: profilesError } = await supabase.rpc('exec', {
      sql: `
        SELECT column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'ria_profiles' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `
    })
    
    if (profilesError) {
      console.log('❌ Error checking profiles schema:', profilesError)
    } else {
      console.table(profilesSchema)
    }
    
    // Sample data check
    console.log('\n📊 SAMPLE DATA CHECK:')
    
    // Check narratives sample
    const { data: narrativeSample, error: narrativeSampleError } = await supabase
      .from('narratives')
      .select('*')
      .not('embedding_vector', 'is', null)
      .limit(1)
    
    if (narrativeSampleError) {
      console.log('❌ Error fetching narrative sample:', narrativeSampleError)
    } else if (narrativeSample && narrativeSample.length > 0) {
      console.log('✅ Narratives sample structure:')
      const sample = narrativeSample[0]
      Object.keys(sample).forEach(key => {
        const value = sample[key]
        console.log(`  - ${key}: ${typeof value} ${Array.isArray(value) ? `(array length: ${value.length})` : ''}`)
      })
    }
    
    // Check profiles sample  
    const { data: profileSample, error: profileSampleError } = await supabase
      .from('ria_profiles')
      .select('*')
      .limit(1)
    
    if (profileSampleError) {
      console.log('❌ Error fetching profile sample:', profileSampleError)
    } else if (profileSample && profileSample.length > 0) {
      console.log('✅ RIA Profiles sample structure:')
      const sample = profileSample[0]
      Object.keys(sample).forEach(key => {
        const value = sample[key]
        console.log(`  - ${key}: ${typeof value} ${Array.isArray(value) ? `(array length: ${value.length})` : ''}`)
      })
    }
    
    // Check existing functions
    console.log('\n🔧 EXISTING FUNCTIONS:')
    const { data: functions, error: functionsError } = await supabase.rpc('exec', {
      sql: `
        SELECT 
          routine_name, 
          routine_type,
          data_type as return_type
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name LIKE '%narratives%' 
        OR routine_name LIKE '%search%'
        ORDER BY routine_name;
      `
    })
    
    if (functionsError) {
      console.log('❌ Error checking functions:', functionsError)
    } else {
      console.table(functions)
    }
    
  } catch (error) {
    console.error('💥 Schema check failed:', error)
  }
}

// Run check
checkCurrentSchema()
  .then(() => {
    console.log('\n✅ Schema check complete')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Schema check failed:', error)
    process.exit(1)
  })
