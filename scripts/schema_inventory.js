// Script to inventory schema objects in Supabase
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
  try {
    // List tables
    console.log('QUERYING TABLES...');
    const { data: tables, error: tablesError } = await supabase.rpc('list_tables');
    
    if (tablesError) {
      console.error('Error querying tables:', tablesError);
      
      // Alternative approach - query tables directly
      console.log('Trying alternative approach...');
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
      
      console.log('Tables found:');
      for (const table of tables) {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
          
        if (error) {
          console.log(`- ${table}: Error - ${error.message}`);
        } else {
          console.log(`- ${table}: ${count} rows`);
        }
      }
    } else {
      console.log('Tables:', tables);
    }
    
    // Try to query for functions
    console.log('\nQUERYING FUNCTIONS...');
    try {
      const { data: functions, error: functionsError } = await supabase.rpc('list_functions');
      
      if (functionsError) {
        console.error('Error querying functions:', functionsError);
        
        // Try known functions
        const knownFunctions = [
          'match_documents',
          'search_rias',
          'hybrid_search_rias',
          'compute_vc_activity',
          'checkQueryLimit',
          'logQueryUsage'
        ];
        
        console.log('Trying known functions...');
        for (const func of knownFunctions) {
          try {
            // Simple test call with no parameters
            const { data, error } = await supabase.rpc(func);
            console.log(`- ${func}: ${error ? 'Error - ' + error.message : 'Exists'}`);
          } catch (e) {
            console.log(`- ${func}: Error - ${e.message}`);
          }
        }
      } else {
        console.log('Functions:', functions);
      }
    } catch (functionsError) {
      console.error('Error querying functions list:', functionsError);
    }
    
    // Try to query for views
    console.log('\nQUERYING VIEWS...');
    try {
      const { data: views, error: viewsError } = await supabase.rpc('list_views');
      
      if (viewsError) {
        console.error('Error querying views:', viewsError);
      } else {
        console.log('Views:', views);
      }
    } catch (viewsError) {
      console.error('Error querying views list:', viewsError);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkSchema();
