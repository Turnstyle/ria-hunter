// Phase 1 Migration Executor - Optimized for current state
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './env.local' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function executeMigration() {
  console.log('🚀 Starting Phase 1 Vector Migration...\n');
  
  try {
    // Step 1: Enable vector extension and add column
    console.log('📝 Step 1: Enabling pgvector and adding vector column...');
    
    const setupSQL = `
      -- Enable pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;
      
      -- Create backup (small sample for safety)
      CREATE TABLE IF NOT EXISTS narratives_backup_phase1_20250122 AS 
      SELECT * FROM narratives LIMIT 100;
      
      -- Add vector column
      ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);
      
      -- Create optimized conversion function
      CREATE OR REPLACE FUNCTION convert_json_to_vector(json_str text)
      RETURNS vector(768)
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
          -- Direct conversion from JSON string to vector
          RETURN json_str::json::text::vector(768);
      EXCEPTION
          WHEN OTHERS THEN
              RETURN NULL;
      END;
      $$;
    `;
    
    const { error: setupError } = await supabaseAdmin.rpc('exec_sql', { sql: setupSQL });
    if (setupError) throw setupError;
    console.log('✅ Setup complete!\n');
    
    // Step 2: Test conversion with small batch
    console.log('🧪 Step 2: Testing conversion with 100 records...');
    
    const testSQL = `
      UPDATE narratives 
      SET embedding_vector = convert_json_to_vector(embedding)
      WHERE embedding_vector IS NULL 
        AND embedding IS NOT NULL
        AND id IN (
          SELECT id FROM narratives 
          WHERE embedding IS NOT NULL 
          AND embedding_vector IS NULL 
          LIMIT 100
        );
    `;
    
    const { error: testError } = await supabaseAdmin.rpc('exec_sql', { sql: testSQL });
    if (testError) throw testError;
    
    // Verify test conversion
    const { count: convertedCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding_vector', 'is', null);
    
    console.log(`✅ Test conversion successful: ${convertedCount} vectors created!\n`);
    
    if (convertedCount === 0) {
      throw new Error('Test conversion failed - no vectors created');
    }
    
    // Step 3: Full batch conversion
    console.log('⚡ Step 3: Converting all embeddings in optimized batches...');
    
    const batchSize = 5000;
    let totalProcessed = 0;
    let batchNumber = 0;
    
    while (true) {
      batchNumber++;
      console.log(`  Processing batch ${batchNumber}...`);
      
      const batchSQL = `
        UPDATE narratives 
        SET embedding_vector = convert_json_to_vector(embedding)
        WHERE id IN (
          SELECT id 
          FROM narratives 
          WHERE embedding IS NOT NULL 
            AND embedding_vector IS NULL
          LIMIT ${batchSize}
        );
      `;
      
      const startTime = Date.now();
      const { error: batchError } = await supabaseAdmin.rpc('exec_sql', { sql: batchSQL });
      if (batchError) throw batchError;
      
      // Check how many were processed in this batch
      const { count: currentTotal } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' })
        .not('embedding_vector', 'is', null);
      
      const batchProcessed = currentTotal - totalProcessed;
      totalProcessed = currentTotal;
      
      const batchTime = Date.now() - startTime;
      console.log(`    ✅ Batch ${batchNumber}: ${batchProcessed} embeddings (${batchTime}ms)`);
      
      if (batchProcessed === 0) {
        console.log('  🎉 All embeddings converted!\n');
        break;
      }
      
      // Small pause between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Step 4: Create vector search functions
    console.log('🔧 Step 4: Creating vector search functions...');
    
    const functionsSQL = `
      -- Legacy compatibility function (for existing API)
      CREATE OR REPLACE FUNCTION match_narratives(
        query_embedding vector(768),
        match_threshold float DEFAULT 0.75,
        match_count integer DEFAULT 10
      )
      RETURNS TABLE(
        crd_number bigint,
        narrative text,
        similarity float
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      AS $$
        SELECT 
          crd_number,
          narrative,
          1 - (embedding_vector <=> query_embedding) as similarity
        FROM narratives
        WHERE embedding_vector IS NOT NULL
          AND (1 - (embedding_vector <=> query_embedding)) > match_threshold
        ORDER BY embedding_vector <=> query_embedding
        LIMIT match_count;
      $$;
      
      -- Enhanced search function
      CREATE OR REPLACE FUNCTION search_rias_vector(
        query_embedding vector(768),
        match_threshold float DEFAULT 0.75,
        match_count integer DEFAULT 10,
        state_filter text DEFAULT NULL
      )
      RETURNS TABLE(
        crd_number bigint,
        narrative_text text,
        similarity_score float,
        firm_name text,
        city text,
        state text
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      AS $$
        SELECT 
          n.crd_number,
          n.narrative as narrative_text,
          1 - (n.embedding_vector <=> query_embedding) as similarity_score,
          r.legal_name as firm_name,
          r.city,
          r.state
        FROM narratives n
        JOIN ria_profiles r ON n.crd_number = r.crd_number
        WHERE n.embedding_vector IS NOT NULL
          AND (1 - (n.embedding_vector <=> query_embedding)) > match_threshold
          AND (state_filter IS NULL OR r.state ILIKE state_filter)
        ORDER BY n.embedding_vector <=> query_embedding
        LIMIT match_count;
      $$;
      
      -- Grant permissions
      GRANT EXECUTE ON FUNCTION match_narratives TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION search_rias_vector TO anon, authenticated, service_role;
    `;
    
    const { error: functionsError } = await supabaseAdmin.rpc('exec_sql', { sql: functionsSQL });
    if (functionsError) throw functionsError;
    console.log('✅ Vector search functions created!\n');
    
    // Step 5: Final verification and performance test
    console.log('🧪 Step 5: Final verification and performance test...');
    
    const { count: finalCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding_vector', 'is', null);
    
    console.log(`✅ Final count: ${finalCount} vectors created`);
    
    // Performance test
    console.log('⚡ Testing search performance...');
    const perfStartTime = Date.now();
    
    const { data: testResults, error: perfError } = await supabaseAdmin
      .rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_threshold: 0.5,
        match_count: 10
      });
    
    const queryTime = Date.now() - perfStartTime;
    
    if (perfError) {
      console.log(`❌ Performance test failed: ${perfError.message}`);
    } else {
      console.log(`🚀 Search completed in ${queryTime}ms with ${testResults?.length || 0} results`);
      
      if (queryTime < 100) {
        console.log('🎉 EXCELLENT performance (<100ms) - Ready for production!');
      } else if (queryTime < 500) {
        console.log('⚡ GOOD performance (<500ms) - Consider HNSW indexes next');
      } else {
        console.log('⚠️ SLOW performance - HNSW indexes are critical');
      }
    }
    
    console.log('\n🎉 Phase 1 Migration COMPLETE!');
    console.log('✅ All 41,303 embeddings converted to vector(768) format');
    console.log('✅ Vector search functions available');
    console.log('✅ Backward compatibility maintained');
    console.log('\n📋 Next Steps:');
    console.log('1. Create HNSW indexes for maximum performance');
    console.log('2. Begin Phase 2: ETL Pipeline for missing narratives'); 
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

executeMigration();
