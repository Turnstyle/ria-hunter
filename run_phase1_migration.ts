import { supabaseAdmin } from './lib/supabaseAdmin';
import fs from 'fs';

async function runPhase1Migration() {
  console.log('🚀 Starting Phase 1: Vector Migration and Functions');
  
  try {
    // Read the SQL migration file
    const migrationSQL = fs.readFileSync('phase1_vector_migration.sql', 'utf8');
    
    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📋 Executing ${statements.length} migration statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.includes('migrate_embeddings_to_vector()')) {
        console.log(`\n⏳ Step ${i + 1}/${statements.length}: Converting embeddings to vector format...`);
        console.log('This may take several minutes...');
      } else {
        console.log(`\n✅ Step ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
      }
      
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql: statement
        });
        
        if (error) {
          console.error(`❌ Error in step ${i + 1}:`, error);
          
          // For non-critical errors, continue
          if (error.message?.includes('already exists') || 
              error.message?.includes('does not exist')) {
            console.log('⚠️ Non-critical error, continuing...');
            continue;
          } else {
            throw new Error(`Migration failed at step ${i + 1}: ${error.message}`);
          }
        }
        
        console.log('✅ Success');
        
      } catch (stepError) {
        console.error(`❌ Step ${i + 1} failed:`, stepError);
        throw stepError;
      }
    }
    
    // Run the actual embedding migration
    console.log('\n🔄 Starting embedding conversion...');
    const { error: migrationError } = await supabaseAdmin.rpc('migrate_embeddings_to_vector');
    
    if (migrationError) {
      console.error('❌ Embedding migration failed:', migrationError);
      throw migrationError;
    }
    
    console.log('✅ Embedding conversion complete!');
    
    // Verify the migration
    console.log('\n🔍 Verifying migration results...');
    const { count: vectorCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding_vector', 'is', null);
    
    const { count: totalCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding', 'is', null);
    
    console.log(`📊 Migration results:`);
    console.log(`- Total narratives with string embeddings: ${totalCount}`);
    console.log(`- Successfully converted to vector: ${vectorCount}`);
    console.log(`- Success rate: ${((vectorCount! / totalCount!) * 100).toFixed(2)}%`);
    
    if (vectorCount === totalCount) {
      console.log('🎉 Phase 1 migration completed successfully!');
      return true;
    } else {
      console.log('⚠️ Some embeddings may not have been converted. Review logs.');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    console.log('\n🔄 To rollback, restore from backup tables:');
    console.log('- narratives_backup_phase1');
    console.log('- ria_profiles_backup_phase1');
    throw error;
  }
}

// Run the migration
runPhase1Migration()
  .then((success) => {
    if (success) {
      console.log('\n✨ Phase 1 complete! Next steps:');
      console.log('1. Create HNSW indexes (Phase 1b)');
      console.log('2. Test vector search functions');
      console.log('3. Begin Phase 2: ETL Pipeline');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
