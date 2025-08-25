// Test script to verify skipping of undefined names

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSkipUndefined() {
  console.log('Testing skip undefined names functionality...');
  
  // Query for specifically known undefined name RIAs
  const { data: undefinedRIAs, error } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name')
    .in('crd_number', [282155, 282156, 282159, 282177, 282178])
    .order('crd_number');
    
  if (error) {
    console.error('Error fetching undefined RIAs:', error.message);
    return;
  }
  
  console.log(`Found ${undefinedRIAs.length} RIAs to test with:`);
  undefinedRIAs.forEach(ria => {
    console.log(`CRD #${ria.crd_number}: legal_name=${ria.legal_name || 'undefined'}`);
  });
  
  // Filter out those with undefined names
  const riasWithNames = undefinedRIAs.filter(ria => ria.legal_name);
  const riasWithoutNames = undefinedRIAs.filter(ria => !ria.legal_name);
  
  console.log(`\nRIAs with names: ${riasWithNames.length}`);
  console.log(`RIAs without names: ${riasWithoutNames.length}`);
  
  console.log('\nRIAs that would be processed:');
  riasWithNames.forEach(ria => {
    console.log(`- CRD #${ria.crd_number}: ${ria.legal_name}`);
  });
  
  console.log('\nRIAs that would be skipped:');
  riasWithoutNames.forEach(ria => {
    console.log(`- CRD #${ria.crd_number}`);
  });
  
  // Check the current narratives
  const crdNumbers = undefinedRIAs.map(ria => ria.crd_number);
  const { data: narratives, error: narrativesError } = await supabase
    .from('narratives')
    .select('crd_number')
    .in('crd_number', crdNumbers);
    
  if (narrativesError) {
    console.error('Error fetching narratives:', narrativesError.message);
    return;
  }
  
  console.log(`\nRIAs already with narratives: ${narratives ? narratives.length : 0}`);
  if (narratives && narratives.length > 0) {
    narratives.forEach(narrative => {
      console.log(`- CRD #${narrative.crd_number}`);
    });
  }
}

testSkipUndefined().catch(console.error);
