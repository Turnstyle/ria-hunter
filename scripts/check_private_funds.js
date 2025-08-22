// Script to check ria_private_funds table structure
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPrivateFundsStructure() {
  try {
    // Fetch sample data from ria_private_funds
    const { data, error } = await supabase
      .from('ria_private_funds')
      .select('*')
      .limit(2);
      
    if (error) {
      console.error('Error querying ria_private_funds:', error);
      return;
    }
    
    console.log('RIA Private Funds table structure:');
    if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
      console.log('\nSample data:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('No data found in ria_private_funds table');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkPrivateFundsStructure();
