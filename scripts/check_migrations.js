// Script to check migration status
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkMigrations() {
  try {
    console.log('Checking migration status...');
    
    // Try to query the migrations table
    const { data: migrations, error: migrationsError } = await supabase
      .from('migrations')
      .select('*')
      .order('id', { ascending: false });
      
    if (migrationsError) {
      console.error('Error querying migrations table:', migrationsError);
      console.log('Migrations table may not exist or is not accessible with current permissions');
    } else {
      console.log(`Found ${migrations.length} applied migrations in the database`);
      console.log('\nMost recent applied migrations:');
      migrations.slice(0, 5).forEach(m => {
        console.log(`- ${m.name} (applied: ${new Date(m.executed_at).toLocaleString()})`);
      });
    }
    
    // List migration files from the filesystem
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    let migrationFiles;
    
    try {
      migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
        
      console.log(`\nFound ${migrationFiles.length} migration files in the filesystem`);
      
      // If we have access to the migrations table, compare
      if (migrations) {
        const appliedNames = new Set(migrations.map(m => m.name));
        const pendingMigrations = migrationFiles.filter(file => !appliedNames.has(file));
        
        console.log(`\nPending migrations (${pendingMigrations.length}):`);
        if (pendingMigrations.length === 0) {
          console.log('All migrations appear to be applied');
        } else {
          pendingMigrations.forEach(file => {
            console.log(`- ${file}`);
          });
        }
      }
      
      // Check for function existence as a proxy for migration success
      console.log('\nChecking for expected database functions...');
      const expectedFunctions = [
        'match_narratives',
        'search_rias_by_narrative',
        'search_rias',
        'hybrid_search_rias',
        'compute_vc_activity'
      ];
      
      for (const funcName of expectedFunctions) {
        try {
          // Try to call the function with dummy parameters
          const result = await supabase.rpc(funcName);
          console.log(`- ${funcName}: ${result.error ? 'Error: ' + result.error.message : 'Exists'}`);
        } catch (e) {
          console.log(`- ${funcName}: Not found or not accessible`);
        }
      }
      
    } catch (fsError) {
      console.error('Error reading migrations directory:', fsError);
    }
    
    // Try to check for pgvector extension
    console.log('\nChecking for pgvector extension...');
    try {
      const { data, error } = await supabase.rpc('check_extension', { ext_name: 'vector' });
      if (error) {
        console.log('Error checking pgvector extension:', error.message);
        
        // Alternative check - try to query embedding column type
        const { data: colData, error: colError } = await supabase.rpc('check_column_type', { 
          table_name: 'narratives', 
          column_name: 'embedding' 
        });
        
        if (colError) {
          console.log('Error checking embedding column type:', colError.message);
        } else {
          console.log('Embedding column type:', colData);
        }
      } else {
        console.log('pgvector extension status:', data);
      }
    } catch (e) {
      console.log('Error checking pgvector extension:', e.message);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Create helper functions if they don't exist
async function createHelperFunctions() {
  try {
    console.log('Creating helper functions...');
    
    // Create a function to check if an extension exists
    const { error: extError } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION check_extension(ext_name TEXT)
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        AS $$
        DECLARE
          exists_bool BOOLEAN;
        BEGIN
          SELECT EXISTS(
            SELECT 1
            FROM pg_extension
            WHERE extname = ext_name
          ) INTO exists_bool;
          
          RETURN exists_bool;
        END;
        $$;
      `
    });
    
    if (extError) {
      console.error('Error creating check_extension function:', extError);
    }
    
    // Create a function to check column type
    const { error: colError } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION check_column_type(table_name TEXT, column_name TEXT)
        RETURNS TEXT
        LANGUAGE plpgsql
        AS $$
        DECLARE
          col_type TEXT;
        BEGIN
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = check_column_type.table_name
            AND column_name = check_column_type.column_name
          INTO col_type;
          
          RETURN col_type;
        END;
        $$;
      `
    });
    
    if (colError) {
      console.error('Error creating check_column_type function:', colError);
    }
  } catch (error) {
    console.error('Error creating helper functions:', error);
  }
}

async function run() {
  await createHelperFunctions();
  await checkMigrations();
}

run();
