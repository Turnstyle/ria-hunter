const { createClient } = require('@supabase/supabase-js');

// Use environment variables from env.local
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseKey);

// List of possible table names to check
const tablesToCheck = [
  'ria_profiles',
  'narratives',
  'ria_narratives',
  'control_persons',
  'ria_private_funds',
  'private_funds'
];

async function checkTables() {
  console.log('Checking specific tables...');
  
  for (const tableName of tablesToCheck) {
    try {
      const { data, error, status } = await supabase
        .from(tableName)
        .select('count')
        .limit(1);
      
      if (error) {
        console.log(`${tableName}: ❌ Error accessing - ${error.message}`);
      } else {
        console.log(`${tableName}: ✅ Table exists - ${data && data.length > 0 ? data[0].count : 'No data'}`);
      }
    } catch (error) {
      console.log(`${tableName}: ❌ Error - ${error.message}`);
    }
  }
}

checkTables();
