// Script to check available tables in the Supabase database

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking available tables...');
  
  const possibleTables = [
    'ria_profiles',
    'narratives',
    'control_persons',
    'ria_private_funds',
    'form_adv',
    'sec_filings',
    'raw_ria_data',
    'ria_data',
    'ria_raw_data',
    'raw_sec_data',
    'ria_form_adv'
  ];
  
  for (const table of possibleTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('count');
        
      if (error) {
        console.log(`❌ Table "${table}" not found: ${error.message}`);
      } else {
        console.log(`✅ Table "${table}" exists with ${data[0].count} records`);
      }
    } catch (e) {
      console.log(`❌ Error checking table "${table}": ${e.message}`);
    }
  }
  
  // Also check a random record from ria_profiles to see column names
  try {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('*')
      .limit(1);
      
    if (error) {
      console.log('Error fetching sample ria_profile:', error.message);
    } else if (data && data.length > 0) {
      console.log('\nSample ria_profile column names:');
      Object.keys(data[0]).forEach(key => {
        console.log(`- ${key}`);
      });
    }
  } catch (e) {
    console.log('Error checking ria_profiles sample:', e.message);
  }
}

checkTables().catch(e => {
  console.error('Fatal error:', e);
});
