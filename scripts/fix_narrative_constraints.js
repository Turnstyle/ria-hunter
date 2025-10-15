/**
 * Fix Narrative Constraints Script
 * Resolves the duplicate key constraint issue in narrative generation
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Main function to fix narrative constraints
 */
async function fixNarrativeConstraints() {
  console.log('🔧 Starting narrative constraints fix...');
  
  // Step 1: Check for the constraint
  console.log('\n1️⃣ Checking for constraint "narratives_crd_number_unique"...');
  try {
    const { data: constraints, error } = await supabase.rpc('get_table_constraints', {
      table_name: 'narratives'
    });
    
    if (error) {
      console.error('Error checking constraints:', error);
      
      // Fallback to raw SQL query if RPC fails
      const { data, error: sqlError } = await supabase.from('_dummy_query_for_constraints').select('*')
        .csv('SELECT conname, contype FROM pg_constraint WHERE conrelid = \'narratives\'::regclass::oid');
      
      if (sqlError) {
        console.error('Fallback query also failed:', sqlError);
        throw new Error('Unable to check constraints');
      }
      
      console.log('Fallback query results:', data);
    } else {
      console.log('Constraints found:', constraints);
    }
  } catch (err) {
    console.error('Failed to check constraints:', err);
  }
  
  // Step 2: Create a temporary table to store existing narratives
  console.log('\n2️⃣ Creating temporary backup of narratives...');
  try {
    const { error: createError } = await supabase.rpc('execute_sql', {
      sql_statement: 'CREATE TABLE IF NOT EXISTS narratives_backup AS SELECT * FROM narratives'
    });
    
    if (createError) {
      console.error('Error creating backup table:', createError);
      throw new Error('Failed to create backup table');
    }
    
    console.log('✅ Backup table created successfully');
    
    // Check backup count
    const { data: backupCount, error: countError } = await supabase
      .from('narratives_backup')
      .select('count');
    
    if (countError) {
      console.error('Error counting backup narratives:', countError);
    } else {
      console.log(`📊 Backed up ${backupCount[0].count} narratives`);
    }
  } catch (err) {
    console.error('Failed to create backup:', err);
  }
  
  // Step 3: Drop the unique constraint
  console.log('\n3️⃣ Dropping the unique constraint...');
  try {
    const { error: dropError } = await supabase.rpc('execute_sql', {
      sql_statement: 'ALTER TABLE narratives DROP CONSTRAINT IF EXISTS narratives_crd_number_unique'
    });
    
    if (dropError) {
      console.error('Error dropping constraint:', dropError);
      throw new Error('Failed to drop constraint');
    }
    
    console.log('✅ Constraint dropped successfully');
  } catch (err) {
    console.error('Failed to drop constraint:', err);
  }
  
  // Step 4: Create a more appropriate constraint (optional)
  console.log('\n4️⃣ Creating a more appropriate constraint...');
  try {
    // Instead of a unique constraint on just crd_number, create a unique constraint on (crd_number, narrative_type)
    // This allows multiple narratives per RIA but ensures uniqueness per narrative type
    const { error: newConstraintError } = await supabase.rpc('execute_sql', {
      sql_statement: 'ALTER TABLE narratives ADD CONSTRAINT narratives_crd_narrative_type_unique UNIQUE (crd_number, narrative_type)'
    });
    
    if (newConstraintError) {
      console.error('Error creating new constraint:', newConstraintError);
      console.log('Continuing without new constraint...');
    } else {
      console.log('✅ New constraint created successfully');
    }
  } catch (err) {
    console.error('Failed to create new constraint:', err);
  }
  
  // Step 5: Verify the fix
  console.log('\n5️⃣ Verifying the fix...');
  try {
    // Check if we can insert a duplicate crd_number with different narrative_type
    const testCRD = '123456';
    const testNarrative = 'Test narrative for constraint verification';
    
    // First, clean up any existing test data
    await supabase
      .from('narratives')
      .delete()
      .eq('crd_number', testCRD);
    
    // Insert first test narrative
    const { error: insertError1 } = await supabase
      .from('narratives')
      .insert({
        crd_number: testCRD,
        narrative_text: testNarrative,
        narrative_type: 'test_type_1',
        embedding_vector: null
      });
    
    if (insertError1) {
      console.error('Error inserting first test narrative:', insertError1);
    } else {
      console.log('✅ First test narrative inserted successfully');
      
      // Try to insert a second narrative with same CRD but different type
      const { error: insertError2 } = await supabase
        .from('narratives')
        .insert({
          crd_number: testCRD,
          narrative_text: testNarrative,
          narrative_type: 'test_type_2',
          embedding_vector: null
        });
      
      if (insertError2) {
        console.error('Error inserting second test narrative:', insertError2);
        console.log('❌ Fix verification failed - still cannot insert multiple narratives per CRD');
      } else {
        console.log('✅ Second test narrative inserted successfully');
        console.log('✅ Fix verification successful - can now insert multiple narratives per CRD with different types');
      }
      
      // Clean up test data
      await supabase
        .from('narratives')
        .delete()
        .eq('crd_number', testCRD);
    }
  } catch (err) {
    console.error('Failed to verify fix:', err);
  }
  
  console.log('\n🎉 Narrative constraints fix completed');
  console.log('You can now restart the narrative generation processes with:');
  console.log(`
  # Terminal 1 - first quarter (CRDs 1000-17000)
  node scripts/etl_narrative_generator.js --start-crd 1000 --end-crd 17000 > logs/narrative_1000_17000.log 2>&1 &
  
  # Terminal 2 - second quarter (CRDs 17001-33000)
  node scripts/etl_narrative_generator.js --start-crd 17001 --end-crd 33000 > logs/narrative_17001_33000.log 2>&1 &
  
  # Terminal 3 - third quarter (CRDs 33001-49000)
  node scripts/etl_narrative_generator.js --start-crd 33001 --end-crd 49000 > logs/narrative_33001_49000.log 2>&1 &
  
  # Terminal 4 - fourth quarter (CRDs 49001-66000)
  node scripts/etl_narrative_generator.js --start-crd 49001 --end-crd 66000 > logs/narrative_49001_66000.log 2>&1 &
  `);
}

// Execute the fix
fixNarrativeConstraints().catch(error => {
  console.error('Error in constraint fix script:', error);
});
