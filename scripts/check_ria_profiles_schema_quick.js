/**
 * Quick schema check for ria_profiles table
 */

const { createClient } = require('@supabase/supabase-js')
const { validateEnvVars } = require('./load-env')

const { supabaseUrl, supabaseServiceKey } = validateEnvVars()
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkSchema() {
  console.log('📋 RIA_PROFILES TABLE SCHEMA CHECK')
  console.log('='.repeat(50))
  
  try {
    // Get a sample record to see the data types
    const { data: sample, error } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .limit(1)
      .single()
    
    if (error) {
      console.log('❌ Error:', error.message)
      return
    }
    
    console.log('Sample record:')
    console.log('  crd_number:', typeof sample.crd_number, '=', sample.crd_number)
    console.log('  legal_name:', typeof sample.legal_name, '=', sample.legal_name)
    console.log('  city:', typeof sample.city, '=', sample.city)  
    console.log('  state:', typeof sample.state, '=', sample.state)
    
    // Check narratives table schema too
    const { data: narrative, error: nError } = await supabase
      .from('narratives')
      .select('crd_number')
      .limit(1)
      .single()
      
    if (!nError && narrative) {
      console.log('\nNarratives table:')
      console.log('  crd_number:', typeof narrative.crd_number, '=', narrative.crd_number)
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkSchema()
