// Fix narratives table constraints for proper upserts
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixNarrativesConstraints() {
  console.log('🔧 Fixing narratives table constraints for upserts');
  console.log('='.repeat(60));
  
  try {
    // First, check current constraints
    console.log('📋 Checking current constraints...');
    
    const { data: constraints, error: checkError } = await supabase.rpc('sql', {
      query: `
        SELECT constraint_name, constraint_type, column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'narratives' 
          AND tc.table_schema = 'public'
        ORDER BY constraint_name;
      `
    });

    if (checkError) {
      console.log('⚠️  Could not check constraints via RPC:', checkError.message);
    } else {
      console.log('Current constraints:', constraints);
    }

    // The issue is that we need a unique constraint on crd_number for upserts
    console.log('\n🔨 Adding unique constraint on crd_number...');
    
    const addConstraintSQL = `
      ALTER TABLE narratives 
      ADD CONSTRAINT narratives_crd_number_unique 
      UNIQUE (crd_number);
    `;

    const { error: constraintError } = await supabase.rpc('sql', {
      query: addConstraintSQL
    });

    if (constraintError) {
      if (constraintError.message.includes('already exists')) {
        console.log('✅ Constraint already exists');
      } else if (constraintError.message.includes('could not create unique index')) {
        console.log('⚠️  Constraint creation failed - probably due to duplicate crd_numbers');
        console.log('   Need to clean up duplicates first...');
        
        // Check for duplicates
        const { data: dupes } = await supabase.rpc('sql', {
          query: `
            SELECT crd_number, COUNT(*) as count
            FROM narratives 
            GROUP BY crd_number 
            HAVING COUNT(*) > 1
            ORDER BY count DESC;
          `
        });
        
        console.log('🔍 Duplicate crd_numbers found:', dupes);
        
        if (dupes && dupes.length > 0) {
          console.log('🧹 Cleaning up duplicates...');
          
          // Keep only the most recent record for each crd_number
          const cleanupSQL = `
            DELETE FROM narratives 
            WHERE id NOT IN (
              SELECT DISTINCT ON (crd_number) id
              FROM narratives 
              ORDER BY crd_number, created_at DESC
            );
          `;
          
          const { error: cleanupError } = await supabase.rpc('sql', {
            query: cleanupSQL
          });
          
          if (cleanupError) {
            console.log('❌ Cleanup failed:', cleanupError);
            return;
          } else {
            console.log('✅ Duplicates cleaned up');
            
            // Try adding constraint again
            const { error: retryError } = await supabase.rpc('sql', {
              query: addConstraintSQL
            });
            
            if (retryError) {
              console.log('❌ Constraint creation still failed:', retryError);
              return;
            } else {
              console.log('✅ Unique constraint added successfully');
            }
          }
        }
      } else {
        console.log('❌ Constraint creation failed:', constraintError);
        return;
      }
    } else {
      console.log('✅ Unique constraint added successfully');
    }

    // Verify the fix
    console.log('\n🧪 Testing upsert operation...');
    
    const testSQL = `
      INSERT INTO narratives (crd_number, narrative, embedding) 
      VALUES (999999, 'Test narrative for constraint verification', NULL)
      ON CONFLICT (crd_number) 
      DO UPDATE SET narrative = EXCLUDED.narrative, updated_at = NOW()
      RETURNING id;
    `;
    
    const { data: testData, error: testError } = await supabase.rpc('sql', {
      query: testSQL
    });

    if (testError) {
      console.log('❌ Upsert test failed:', testError);
    } else {
      console.log('✅ Upsert test passed');
      
      // Clean up test record
      await supabase.rpc('sql', {
        query: 'DELETE FROM narratives WHERE crd_number = 999999;'
      });
      console.log('✅ Test record cleaned up');
    }

    // Check final narrative count
    const { count: finalCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Current narratives count: ${finalCount}`);
    console.log('🎯 Ready to generate ~40,000 new narratives');

  } catch (err) {
    console.error('💥 Fix failed:', err.message);
  }
  
  console.log('='.repeat(60));
  console.log('🏁 Narratives constraints fix complete');
}

fixNarrativesConstraints();
