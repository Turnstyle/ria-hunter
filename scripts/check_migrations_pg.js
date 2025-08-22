// Script to check migrations at the PostgreSQL level
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkMigrationsAndSchema() {
  try {
    console.log('Checking for pgmigrations table...');
    
    // Check for pgmigrations table
    const { data: migrationTables, error: tableError } = await supabase.rpc('check_table_exists', {
      table_name: 'pgmigrations'
    });
    
    if (tableError) {
      console.error('Error checking for pgmigrations table:', tableError);
      
      // Try a raw query to check for the table
      const { data, error } = await supabase.from('_metadata').select('*').limit(1);
      console.log('Attempted to query _metadata table:', data ? 'Success' : 'Failed', error ? error.message : '');
    } else {
      console.log('pgmigrations table exists:', migrationTables);
    }
    
    // List migration files
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    let migrationFiles;
    
    try {
      migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
        
      console.log(`\nFound ${migrationFiles.length} migration files in the filesystem`);
      console.log('Migration files:');
      migrationFiles.forEach(file => {
        console.log(`- ${file}`);
      });
    } catch (fsError) {
      console.error('Error reading migrations directory:', fsError);
    }
    
    // Check for common Supabase tables
    const commonTables = [
      'auth.users', 
      'storage.buckets', 
      'extensions',
      '_prisma_migrations',
      'schema_migrations'
    ];
    
    console.log('\nChecking for other migration tracking tables...');
    
    for (const table of commonTables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        console.log(`- ${table}: ${error ? 'Not found' : 'Exists'}`);
      } catch (e) {
        console.log(`- ${table}: Not found (error: ${e.message})`);
      }
    }
    
    // Try to execute a simple migration to test permissions
    console.log('\nTesting migration execution permission...');
    
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: 'CREATE TEMPORARY TABLE _migration_test (id serial primary key, name text);'
      });
      
      if (error) {
        console.error('Error executing test migration:', error);
      } else {
        console.log('Successfully executed test migration');
        
        // Clean up
        const { error: cleanupError } = await supabase.rpc('exec_sql', {
          sql: 'DROP TABLE IF EXISTS _migration_test;'
        });
        
        if (cleanupError) {
          console.error('Error cleaning up test migration:', cleanupError);
        }
      }
    } catch (e) {
      console.error('Error testing migration execution:', e);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Create helper functions
async function createHelperFunctions() {
  try {
    console.log('Creating helper functions...');
    
    // Try to create a function to check if a table exists
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION check_table_exists(table_name TEXT)
        RETURNS BOOLEAN
        LANGUAGE plpgsql
        AS $$
        DECLARE
          exists_bool BOOLEAN;
        BEGIN
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = check_table_exists.table_name
          ) INTO exists_bool;
          
          RETURN exists_bool;
        END;
        $$;
      `
    });
    
    if (error) {
      console.error('Error creating check_table_exists function:', error);
      
      // Try alternative approach using the SQL tag
      const { data: altData, error: altError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE OR REPLACE FUNCTION check_table_exists(table_name TEXT)
          RETURNS BOOLEAN
          LANGUAGE plpgsql
          AS $$
          DECLARE
            exists_bool BOOLEAN;
          BEGIN
            SELECT EXISTS(
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = check_table_exists.table_name
            ) INTO exists_bool;
            
            RETURN exists_bool;
          END;
          $$;
        `
      });
      
      if (altError) {
        console.error('Error creating helper function with exec_sql:', altError);
      }
    }
  } catch (error) {
    console.error('Error creating helper functions:', error);
  }
}

async function run() {
  await createHelperFunctions();
  await checkMigrationsAndSchema();
}

run();
