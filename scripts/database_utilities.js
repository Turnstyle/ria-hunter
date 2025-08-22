// Script for database utilities: PostgreSQL version, indexes, pgvector, migration tracking
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Calculate time to complete narrative generation
function calculateNarrativeBacklog() {
  console.log('Calculating time to complete narrative generation...');
  
  // Based on previous analysis:
  // - 41,303 narratives were generated in 42 minutes, 49 seconds
  // - That's a rate of 964.48 narratives per minute
  // - 62,317 profiles still need narratives
  
  const processingRate = 964.48; // narratives per minute
  const remainingProfiles = 62317;
  
  const estimatedMinutes = remainingProfiles / processingRate;
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = Math.floor(estimatedMinutes % 60);
  
  console.log(`\nNarrative Backlog:`);
  console.log(`- Profiles with narratives: 41,303`);
  console.log(`- Profiles without narratives: 62,317`);
  console.log(`- Processing rate: 964.48 narratives per minute`);
  console.log(`- Estimated time to process remaining profiles: ${hours} hours, ${minutes} minutes`);
  console.log(`- Total expected narratives after completion: 103,620`);
}

// Generate SQL for migration tracking
function proposeMigrationTracking() {
  console.log('Proposing SQL for migration tracking...');
  
  const migrationTrackingSQL = `
-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  checksum VARCHAR(64),
  execution_time NUMERIC,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  applied_by VARCHAR(255)
);

-- Function to record a migration
CREATE OR REPLACE FUNCTION public.record_migration(
  p_name VARCHAR,
  p_checksum VARCHAR DEFAULT NULL,
  p_execution_time NUMERIC DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_error TEXT DEFAULT NULL,
  p_applied_by VARCHAR DEFAULT CURRENT_USER
) RETURNS VOID LANGUAGE SQL AS $$
  INSERT INTO public.schema_migrations (
    name, checksum, execution_time, success, error, applied_by
  ) VALUES (
    p_name, p_checksum, p_execution_time, p_success, p_error, p_applied_by
  )
  ON CONFLICT (name) 
  DO UPDATE SET
    checksum = p_checksum,
    execution_time = p_execution_time,
    success = p_success,
    error = p_error,
    applied_by = p_applied_by,
    applied_at = NOW();
$$;

-- Function to check if a migration has been applied
CREATE OR REPLACE FUNCTION public.migration_applied(p_name VARCHAR)
RETURNS BOOLEAN LANGUAGE SQL AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schema_migrations 
    WHERE name = p_name AND success = TRUE
  );
$$;

-- Insert existing migrations based on current schema
INSERT INTO public.schema_migrations (name, applied_at, success)
VALUES
  ('20250115000000_add_cik_column_to_ria_profiles.sql', NOW(), TRUE),
  ('20250120000000_reset_narratives_vector_768.sql', NOW(), TRUE),
  ('20250120000001_add_narratives_unique_constraint.sql', NOW(), TRUE),
  ('20250804194421_create_ria_tables.sql', NOW(), TRUE),
  ('20250804194730_create_performance_index.sql', NOW(), TRUE),
  ('20250804200000_add_private_placement_data.sql', NOW(), TRUE),
  ('20250804210000_populate_stlouis_private_placement_data.sql', NOW(), TRUE),
  ('20250804220000_fix_stifel_private_placement_data.sql', NOW(), TRUE),
  ('20250804230000_add_remaining_stlouis_rias.sql', NOW(), TRUE),
  ('20250805000000_add_vector_similarity_search.sql', NOW(), FALSE),
  ('20250805100000_add_auth_and_subscription_tables.sql', NOW(), TRUE),
  ('20250812090000_add_contact_and_control_persons.sql', NOW(), TRUE),
  ('20250812092000_add_fax_to_ria_profiles.sql', NOW(), TRUE),
  ('20250812094500_add_private_funds_and_marketers.sql', NOW(), TRUE),
  ('20250813000000_add_compute_vc_activity.sql', NOW(), TRUE),
  ('20250813000200_create_compute_vc_activity_profiles_only.sql', NOW(), TRUE),
  ('20250813001000_data_hygiene_example.sql', NOW(), TRUE),
  ('20250813002000_denorm_views_indexes.sql', NOW(), TRUE),
  ('20250814000000_fix_compute_vc_activity_column_reference.sql', NOW(), TRUE),
  ('20250814000100_add_missing_tables.sql', NOW(), TRUE),
  ('20250814000200_add_contact_submissions_table.sql', NOW(), TRUE),
  ('20250814091500_prod_fix_vc_activity.sql', NOW(), TRUE),
  ('20250814094500_fix_compute_vc_signature.sql', NOW(), TRUE)
ON CONFLICT (name) DO NOTHING;
`;

  console.log(`\nProposed Migration Tracking SQL:`);
  console.log(migrationTrackingSQL);
  
  console.log(`\nIntegration into Future Deployments:`);
  console.log(`1. Create a migration runner script that:
   - Reads migrations from the filesystem in order
   - Checks if each migration has been applied using migration_applied()
   - Applies missing migrations and records results with record_migration()
   - Handles errors and rollbacks appropriately

2. Add a deployment step in CI/CD to run the migration runner before code deployment

3. Update local development workflow to run migrations as part of setup

4. Include a database status check in health endpoints to verify migrations`);
}

// Run database queries to get PostgreSQL version, check pgvector, and list indexes
async function checkDatabaseStatus() {
  try {
    console.log('Checking database status...');
    
    // Try to get PostgreSQL version - this won't work with limited permissions
    console.log('\nAttempting to get PostgreSQL version:');
    try {
      const { data: versionData, error: versionError } = await supabase.rpc('version');
      
      if (versionError) {
        console.log('Error getting PostgreSQL version directly:', versionError.message);
        console.log('Note: This requires elevated permissions and may not be available with the current client.');
        
        // Try alternative approach
        console.log('\nTrying alternative approach to determine version:');
        
        // Use supabase-js version as a proxy for PostgreSQL compatibility
        console.log(`Supabase JavaScript client version: ${require('@supabase/supabase-js/package.json').version}`);
        console.log('Supabase typically uses PostgreSQL 15+ for recent projects');
      } else {
        console.log(`PostgreSQL version: ${versionData}`);
      }
    } catch (e) {
      console.log('Error checking PostgreSQL version:', e.message);
    }
    
    // Check for pgvector extension
    console.log('\nAttempting to check pgvector availability:');
    try {
      const { data: vectorData, error: vectorError } = await supabase.rpc('check_extension', {
        extension_name: 'vector'
      });
      
      if (vectorError) {
        console.log('Error checking pgvector extension:', vectorError.message);
        console.log('Note: This requires elevated permissions and may not be available with the current client.');
        
        // Try alternative approach - check if vector operations work
        console.log('\nTrying alternative approach - checking if vector operations work:');
        
        // Try to query a narrative with embedding
        const { data: embeddingData, error: embeddingError } = await supabase
          .from('narratives')
          .select('embedding')
          .limit(1)
          .single();
          
        if (embeddingError) {
          console.log('Error getting embedding sample:', embeddingError.message);
        } else if (embeddingData && embeddingData.embedding) {
          console.log('Found embedding data in narratives table.');
          console.log('This suggests pgvector extension might be installed but not properly configured for functions.');
        }
      } else {
        console.log(`pgvector extension available: ${vectorData}`);
      }
    } catch (e) {
      console.log('Error checking pgvector extension:', e.message);
    }
    
    // Check for indexes on narratives table
    console.log('\nAttempting to check indexes on narratives table:');
    try {
      const { data: indexData, error: indexError } = await supabase.rpc('list_indexes', {
        table_name: 'narratives'
      });
      
      if (indexError) {
        console.log('Error checking indexes:', indexError.message);
        console.log('Note: This requires elevated permissions and may not be available with the current client.');
        
        // Try alternative approach - check query performance
        console.log('\nTrying alternative approach - checking query performance:');
        
        // Time a query that would use an index if available
        const startTime = Date.now();
        const { data: queryData, error: queryError } = await supabase
          .from('narratives')
          .select('id')
          .eq('crd_number', '123456')
          .limit(1);
          
        const endTime = Date.now();
        const queryTime = endTime - startTime;
        
        if (queryError) {
          console.log('Error running test query:', queryError.message);
        } else {
          console.log(`Query execution time: ${queryTime}ms`);
          console.log(`This ${queryTime < 100 ? 'suggests' : 'does not suggest'} an index might be present on crd_number.`);
        }
      } else {
        console.log('Indexes on narratives table:');
        console.log(indexData);
      }
    } catch (e) {
      console.log('Error checking indexes:', e.message);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run all functions
async function main() {
  // Calculate narrative backlog time
  calculateNarrativeBacklog();
  
  // Propose migration tracking SQL
  proposeMigrationTracking();
  
  // Check database status
  await checkDatabaseStatus();
}

main();
