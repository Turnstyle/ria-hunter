// Script to get row counts for all tables
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getRowCounts() {
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
    
    const counts = [];
    
    console.log('Getting row counts for all tables...');
    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
          
        if (error) {
          console.log(`Error counting ${table}: ${error.message}`);
        } else {
          counts.push({ table, count });
        }
      } catch (e) {
        console.log(`Error counting ${table}: ${e.message}`);
      }
    }
    
    // Sort by descending row count
    counts.sort((a, b) => b.count - a.count);
    
    console.log('\nTable row counts (descending):');
    for (const item of counts) {
      console.log(`${item.table}: ${item.count} rows`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

getRowCounts();
