// Script to check database table counts and structure
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTableCounts() {
  try {
    const tables = [
      'ria_profiles',
      'narratives',
      'control_persons',
      'ria_private_funds',
      'subscriptions',
      'user_queries',
      'user_shares',
      'contact_submissions'
    ];
    
    console.log('Checking table counts...\n');
    
    for (const table of tables) {
      try {
        // Count rows
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
          
        if (error) {
          console.log(`Table '${table}': Error - ${error.message}`);
        } else {
          console.log(`Table '${table}': ${count} rows`);
        }
      } catch (tableError) {
        console.log(`Table '${table}': Error - ${tableError.message}`);
      }
    }
    
    // Check narratives table structure
    console.log('\nChecking narratives table structure...');
    try {
      const { data, error } = await supabase
        .from('narratives')
        .select('*')
        .limit(1);
        
      if (error) {
        console.log(`Error checking narratives table: ${error.message}`);
      } else {
        console.log('Narratives table structure:');
        if (data && data.length > 0) {
          console.log(Object.keys(data[0]));
          // Check if embedding exists
          if (data[0].hasOwnProperty('embedding')) {
            console.log('Embedding column exists in narratives table');
          } else {
            console.log('No embedding column found in narratives table');
          }
        } else {
          console.log('No data found in narratives table');
        }
      }
    } catch (err) {
      console.log(`Error checking narratives structure: ${err.message}`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkTableCounts();
