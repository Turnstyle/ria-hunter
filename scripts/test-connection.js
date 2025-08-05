// Script to test the Supabase connection
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    // Test a simple auth call that should work regardless of tables
    console.log('Testing connection...');
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Connection error:', error);
      return;
    }
    
    console.log('Connection successful! Session data:', data);
    
    // Try to access Supabase storage buckets (which should exist by default)
    console.log('\nTesting storage access...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Storage error:', bucketsError);
    } else {
      console.log('Storage buckets:', buckets);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testConnection();