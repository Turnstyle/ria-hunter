// Temporary script to check current tables in RIA Hunter project
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment check:');
console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

console.log(`Connecting to: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  try {
    // Try to query a simple table first to test connection
    const { data: testData, error: testError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(10);

    if (testError) {
      console.error('Connection test error:', testError);
      
      // Try an alternative approach
      console.log('Trying direct table query...');
      try {
        const { data: altData, error: altError } = await supabase
          .from('ria_profiles')
          .select('count', { count: 'exact' })
          .limit(1);
          
        if (altError) {
          console.log('ria_profiles table does not exist or error:', altError.message);
        } else {
          console.log('ria_profiles table exists with data count available');
        }
      } catch (altErr) {
        console.log('Alternative query failed:', altErr.message);
      }
      
      return;
    }

    console.log('Tables in current project:');
    console.log(testData);

  } catch (err) {
    console.error('Connection error:', err.message);
  }
}

checkTables();
