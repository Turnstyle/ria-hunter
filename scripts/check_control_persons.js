// Script to check control_persons table structure
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkControlPersonsStructure() {
  try {
    // Fetch sample data from control_persons
    const { data, error } = await supabase
      .from('control_persons')
      .select('*')
      .limit(2);
      
    if (error) {
      console.error('Error querying control_persons:', error);
      return;
    }
    
    console.log('Control Persons table structure:');
    if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
      console.log('\nSample data:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('No data found in control_persons table');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkControlPersonsStructure();
