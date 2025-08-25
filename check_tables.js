const { createClient } = require('@supabase/supabase-js');

// Use environment variables from env.local
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
  console.log('Checking database tables...');
  try {
    // Query to list all tables in the public schema
    const { data, error } = await supabase.rpc('list_tables');
    
    if (error) {
      console.error('Error getting tables:', error);
      return;
    }
    
    console.log('Tables in database:');
    if (data && data.length > 0) {
      data.forEach(table => {
        console.log(`- ${table}`);
      });
    } else {
      console.log('No tables found or cannot access table list');
    }
  } catch (error) {
    console.error('Error executing query:', error);
  }
}

// Run the query
listTables();
