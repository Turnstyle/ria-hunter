// Phase 1 Migration Monitor - Check status and guide next steps
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

async function checkMigrationStatus() {
  console.log('🔍 Checking Phase 1 Migration Status...\n');
  
  try {
    // Check if vector column exists
    let vectorColumnExists = false;
    let vectorCount = 0;
    
    try {
      const { count } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' })
        .not('embedding_vector', 'is', null);
      
      vectorCount = count || 0;
      vectorColumnExists = true;
    } catch (error) {
      if (error.message?.includes('embedding_vector')) {
        vectorColumnExists = false;
      } else {
        throw error;
      }
    }
    
    // Get basic counts
    const { count: totalNarratives } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' });
    
    const { count: stringEmbeddings } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding', 'is', null);
    
    console.log('📊 Current Status:');
    console.log(`- Total narratives: ${totalNarratives}`);
    console.log(`- String embeddings: ${stringEmbeddings}`);
    console.log(`- Vector column exists: ${vectorColumnExists ? '✅' : '❌'}`);
    console.log(`- Vector embeddings: ${vectorCount}`);
    
    if (!vectorColumnExists) {
      console.log('\n🚨 MIGRATION NOT STARTED');
      console.log('\n📋 Next Steps:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Copy the contents of phase1_migration_manual.sql');
      console.log('3. Paste and run the SQL script');
      console.log('4. Run this monitor script again to check progress');
      return;
    }
    
    const conversionRate = stringEmbeddings ? (vectorCount / stringEmbeddings) * 100 : 0;
    console.log(`- Conversion rate: ${conversionRate.toFixed(2)}%`);
    
    if (conversionRate < 100) {
      console.log('\n🔄 MIGRATION IN PROGRESS');
      console.log(`   ${vectorCount}/${stringEmbeddings} embeddings converted`);
      console.log('\n📋 Next Steps:');
      console.log('1. Wait for SQL script to complete batch processing');
      console.log('2. Run this monitor again to check progress');
      
      // Set up monitoring loop
      console.log('\n⏳ Starting real-time monitoring...');
      await monitorProgress(stringEmbeddings);
      
    } else if (conversionRate === 100) {
      console.log('\n🎉 MIGRATION COMPLETE!');
      
      // Test functions
      await testSearchFunctions();
      
      // Performance test
      await performanceTest();
      
      console.log('\n✅ Phase 1 Vector Migration COMPLETE!');
      console.log('📋 Next Steps:');
      console.log('1. Create HNSW indexes for maximum performance');
      console.log('2. Begin Phase 2: ETL Pipeline for missing narratives');
      
      return { complete: true, vectorCount };
    }
    
  } catch (error) {
    console.error('❌ Status check failed:', error);
  }
}

async function monitorProgress(totalExpected) {
  let previousCount = 0;
  let stableChecks = 0;
  
  for (let i = 0; i < 60; i++) { // Monitor for 5 minutes max
    try {
      const { count: currentCount } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' })
        .not('embedding_vector', 'is', null);
      
      const progress = ((currentCount || 0) / totalExpected * 100).toFixed(1);
      const rate = currentCount - previousCount;
      
      // Clear line and show progress
      process.stdout.write('\r\x1b[K');
      process.stdout.write(`🔄 Progress: ${currentCount}/${totalExpected} (${progress}%) [+${rate}/5s]`);
      
      if (currentCount === totalExpected) {
        console.log('\n✅ Conversion complete!');
        break;
      }
      
      if (rate === 0) {
        stableChecks++;
        if (stableChecks > 6) { // 30 seconds no change
          console.log('\n⚠️ Progress stalled. Check SQL Editor for errors.');
          break;
        }
      } else {
        stableChecks = 0;
      }
      
      previousCount = currentCount;
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.log('\n❌ Monitoring error:', error.message);
      break;
    }
  }
}

async function testSearchFunctions() {
  console.log('\n🧪 Testing search functions...');
  
  try {
    // Test match_narratives function
    const { data: results, error } = await supabaseAdmin
      .rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_threshold: 0.5,
        match_count: 3
      });
    
    if (error) {
      console.log(`❌ Function test failed: ${error.message}`);
      console.log('   Functions may need to be created manually in SQL Editor');
    } else {
      console.log(`✅ match_narratives working (${results?.length || 0} results)`);
    }
    
  } catch (error) {
    console.log('❌ Function test error:', error.message);
  }
}

async function performanceTest() {
  console.log('\n⚡ Performance testing...');
  
  try {
    const startTime = Date.now();
    
    const { data: results, error } = await supabaseAdmin
      .rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_threshold: 0.7,
        match_count: 10
      });
    
    const queryTime = Date.now() - startTime;
    
    if (error) {
      console.log(`❌ Performance test failed: ${error.message}`);
    } else {
      console.log(`🚀 Query completed in ${queryTime}ms (${results?.length || 0} results)`);
      
      if (queryTime < 50) {
        console.log('🎉 EXCELLENT performance (<50ms) - Ready for production!');
      } else if (queryTime < 200) {
        console.log('⚡ GOOD performance (<200ms) - Consider HNSW indexes for optimization');
      } else if (queryTime < 1000) {
        console.log('⚠️ SLOW performance - HNSW indexes recommended');
      } else {
        console.log('🚨 VERY SLOW performance - HNSW indexes critical');
      }
    }
    
  } catch (error) {
    console.log('❌ Performance test error:', error.message);
  }
}

// Run the status check
checkMigrationStatus();
