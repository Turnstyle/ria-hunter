// Script to test database connection and query
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDatabase() {
  try {
    // Check if ria_profiles table exists and has data
    console.log('Checking ria_profiles table...');
    const { data: allRias, error: tableError } = await supabase
      .from('ria_profiles')
      .select('*')
      .limit(5);
      
    if (tableError) {
      console.error('Error querying table:', tableError);
      return;
    }
    
    console.log(`Found ${allRias?.length || 0} RIA profiles (limited to 5)`);
    if (allRias?.length > 0) {
      console.log('First few RIAs:');
      allRias.forEach(ria => {
        console.log(`- ${ria.firm_name} (${ria.state}) - AUM: ${ria.aum ? '$' + ria.aum.toLocaleString() : 'Not disclosed'}`);
      });
    }
    
    // Check if there are any RIAs in Missouri
    console.log('\nChecking for RIAs in Missouri (MO)...');
    const { data: moRias, error: moError } = await supabase
      .from('ria_profiles')
      .select('*')
      .eq('state', 'MO');
      
    if (moError) {
      console.error('Error querying Missouri RIAs:', moError);
      return;
    }
    
    console.log(`Found ${moRias?.length || 0} RIAs in Missouri`);
    if (moRias?.length > 0) {
      console.log('First 3 Missouri RIAs:');
      moRias.slice(0, 3).forEach(ria => {
        console.log(`- ${ria.firm_name} (AUM: ${ria.aum ? '$' + ria.aum.toLocaleString() : 'Not disclosed'})`);
      });
    }
    
    // Get the largest RIAs by AUM
    console.log('\nLargest RIAs by AUM:');
    const { data: largestRias, error: largestError } = await supabase
      .from('ria_profiles')
      .select('*')
      .order('aum', { ascending: false })
      .limit(5);
      
    if (largestError) {
      console.error('Error querying largest RIAs:', largestError);
      return;
    }
    
    if (largestRias?.length > 0) {
      largestRias.forEach(ria => {
        console.log(`- ${ria.firm_name} (${ria.state}) - AUM: ${ria.aum ? '$' + ria.aum.toLocaleString() : 'Not disclosed'}`);
      });
    } else {
      console.log('No RIAs found with AUM data');
    }
    
    // List available tables
    console.log('\nChecking available tables...');
    const { data, error } = await supabase
      .rpc('get_tables');
      
    if (error) {
      console.error('Error listing tables:', error);
      // Try a different approach to list tables
      console.log('Trying alternative approach...');
      
      // Check if specific tables exist by querying them
      const tables = ['ria_profiles', 'waitlist', 'contact_submissions', 'search_logs'];
      for (const table of tables) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
          
        console.log(`Table '${table}': ${error ? 'Not found or error' : 'Exists'}`);
      }
    } else {
      console.log('Available tables:', data);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testDatabase();