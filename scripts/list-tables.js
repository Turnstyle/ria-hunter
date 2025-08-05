// Script to list all tables in the Supabase database
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listTables() {
  try {
    // Use the system schema to list tables in public schema
    const { data, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');
      
    if (error) {
      console.error('Error listing tables:', error);
      
      // Try a more direct approach
      console.log('Trying a different approach...');
      
      // Try to query a few common tables to see what's available
      const commonTables = [
        'ria_profiles', 
        'users', 
        'profiles', 
        'waitlist',
        'contact_submissions'
      ];
      
      for (const table of commonTables) {
        console.log(`Checking if table '${table}' exists...`);
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
          
        console.log(`Table '${table}': ${error ? `Error: ${error.message}` : 'Exists'}`);
      }
      
      return;
    }
    
    console.log('Available tables in public schema:');
    console.log(data);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

listTables();