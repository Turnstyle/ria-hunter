// Script to check for functions in pg_proc
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPgProc() {
  try {
    console.log('Checking for functions in pg_proc...');
    
    // We can't directly query pg_proc with the anon key, but we can try to execute the functions
    // to determine if they exist in any schema
    
    const functionNames = [
      'match_narratives',
      'search_rias',
      'hybrid_search_rias',
      'compute_vc_activity',
      'search_rias_by_narrative',
      'match_documents'
    ];
    
    console.log('\nAttempting to call functions with minimal parameters:');
    
    for (const funcName of functionNames) {
      try {
        // Try a minimal call to see if the function exists
        const { data, error } = await supabase.rpc(funcName);
        
        if (error) {
          // Parse the error message to determine if it's a "function not found" or a "wrong parameters" error
          const isNotFound = error.message.includes('Could not find the function') || 
                             error.message.includes('does not exist');
          
          const isWrongParams = error.message.includes('function result type') || 
                                error.message.includes('structure of query') ||
                                error.message.includes('wrong number of parameters') ||
                                error.message.includes('function requires');
          
          if (isNotFound) {
            console.log(`- ${funcName}: Not found in any schema`);
          } else if (isWrongParams) {
            console.log(`- ${funcName}: Exists but parameters don't match (${error.message})`);
          } else {
            console.log(`- ${funcName}: Unknown error: ${error.message}`);
          }
        } else {
          console.log(`- ${funcName}: Exists and returned results`);
        }
      } catch (e) {
        console.log(`- ${funcName}: Exception: ${e.message}`);
      }
    }
    
    // Try to check for vector extension
    console.log('\nChecking for pgvector extension...');
    
    // We can't query pg_extension directly, but we can try to use vector operators
    // to indirectly determine if the extension is installed
    
    try {
      // Create a temporary function that uses vector type
      const { data: vecData, error: vecError } = await supabase.rpc('check_vector_support');
      
      if (vecError) {
        const isExtensionMissing = vecError.message.includes('type "vector" does not exist') ||
                                   vecError.message.includes('function not found');
        
        if (isExtensionMissing) {
          console.log('pgvector extension appears to be missing');
        } else {
          console.log('Error checking vector support:', vecError.message);
        }
      } else {
        console.log('pgvector extension appears to be installed');
      }
    } catch (e) {
      console.log('Exception checking vector support:', e.message);
    }
    
    // Try to check for comments on functions
    console.log('\nChecking for function comments/remnants...');
    
    // We don't have direct access to pg_proc, but we can check for function documentation
    // indirectly by trying different schemas or variations
    
    for (const schema of ['public', 'extensions', 'auth']) {
      for (const funcName of functionNames) {
        const fullName = `${schema}.${funcName}`;
        try {
          const { data, error } = await supabase.rpc(`${schema}_${funcName}`);
          if (!error || !error.message.includes('Could not find the function')) {
            console.log(`- Found possible remnant: ${fullName}`);
          }
        } catch (e) {
          // Ignore - just checking for existence
        }
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Create vector testing function (will fail if pgvector is not installed)
async function createVectorTestFunction() {
  try {
    console.log('Creating vector test function...');
    
    // Try to create a function that uses vector type
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        CREATE OR REPLACE FUNCTION check_vector_support()
        RETURNS boolean
        LANGUAGE plpgsql
        AS $$
        DECLARE
          v1 vector(3);
          v2 vector(3);
          result float;
        BEGIN
          v1 := '[1,2,3]'::vector;
          v2 := '[4,5,6]'::vector;
          result := v1 <=> v2;
          RETURN true;
        END;
        $$;
      `
    });
    
    if (error) {
      console.error('Error creating vector test function:', error.message);
    }
  } catch (error) {
    console.error('Error creating vector test function:', error.message);
  }
}

async function run() {
  await createVectorTestFunction();
  await checkPgProc();
}

run();
