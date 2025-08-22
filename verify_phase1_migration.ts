import { supabaseAdmin } from './lib/supabaseAdmin';

interface MigrationStatus {
  totalNarratives: number;
  stringEmbeddings: number;
  vectorEmbeddings: number;
  conversionRate: number;
  functionsAvailable: boolean;
  indexesCreated: number;
}

async function verifyPhase1Migration(): Promise<MigrationStatus> {
  console.log('🔍 Verifying Phase 1 Migration Status...');
  
  try {
    // Check embedding conversion rates
    console.log('\n📊 Checking embedding conversion...');
    
    const { count: totalNarratives } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' });
    
    const { count: stringEmbeddings } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding', 'is', null);
    
    let vectorEmbeddings = 0;
    try {
      const { count: vectorCount } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' })
        .not('embedding_vector', 'is', null);
      
      vectorEmbeddings = vectorCount || 0;
    } catch (error: any) {
      if (error.message?.includes('column "embedding_vector" does not exist')) {
        console.log('❌ embedding_vector column not yet created');
        vectorEmbeddings = 0;
      } else {
        throw error;
      }
    }
    
    const conversionRate = stringEmbeddings ? (vectorEmbeddings / stringEmbeddings) * 100 : 0;
    
    console.log(`- Total narratives: ${totalNarratives}`);
    console.log(`- String embeddings: ${stringEmbeddings}`);
    console.log(`- Vector embeddings: ${vectorEmbeddings}`);
    console.log(`- Conversion rate: ${conversionRate.toFixed(2)}%`);
    
    // Test vector search function availability
    console.log('\n🔧 Testing vector search functions...');
    let functionsAvailable = false;
    
    try {
      // Test the match_narratives function
      const { data: testResults, error: functionError } = await supabaseAdmin
        .rpc('match_narratives', {
          query_embedding: Array(768).fill(0.0), // Zero vector for testing
          match_threshold: 0.1,
          match_count: 1
        });
      
      if (functionError) {
        console.log(`❌ Function test failed: ${functionError.message}`);
        functionsAvailable = false;
      } else {
        console.log(`✅ match_narratives function working (${testResults?.length || 0} results)`);
        functionsAvailable = true;
      }
    } catch (error: any) {
      console.log(`❌ Function not available: ${error.message}`);
      functionsAvailable = false;
    }
    
    // Check for performance improvements (if we can measure query time)
    console.log('\n⚡ Performance test...');
    
    if (vectorEmbeddings > 0) {
      const startTime = Date.now();
      
      try {
        const { data: perfTestResults } = await supabaseAdmin
          .rpc('match_narratives', {
            query_embedding: Array(768).fill(0.1),
            match_threshold: 0.5,
            match_count: 5
          });
        
        const queryTime = Date.now() - startTime;
        console.log(`✅ Query completed in ${queryTime}ms`);
        
        if (queryTime < 100) {
          console.log('🚀 Excellent performance (<100ms)');
        } else if (queryTime < 500) {
          console.log('⚡ Good performance (<500ms)');
        } else {
          console.log('⚠️ Slow performance - may need HNSW indexes');
        }
        
      } catch (perfError) {
        console.log('❌ Performance test failed');
      }
    }
    
    // Summary
    console.log('\n📋 Migration Status Summary:');
    
    const status: MigrationStatus = {
      totalNarratives: totalNarratives || 0,
      stringEmbeddings: stringEmbeddings || 0,
      vectorEmbeddings,
      conversionRate,
      functionsAvailable,
      indexesCreated: 0 // We'll add index checking later
    };
    
    if (conversionRate === 100) {
      console.log('🎉 Phase 1 COMPLETE! All embeddings converted to vector format');
    } else if (conversionRate > 0) {
      console.log(`🔄 Phase 1 IN PROGRESS: ${conversionRate.toFixed(1)}% complete`);
    } else {
      console.log('⏳ Phase 1 NOT STARTED: Run the SQL migration in Supabase SQL Editor');
    }
    
    if (functionsAvailable) {
      console.log('✅ Vector search functions are working');
    } else {
      console.log('❌ Vector search functions need to be created');
    }
    
    return status;
    
  } catch (error) {
    console.error('❌ Migration verification failed:', error);
    throw error;
  }
}

// Also provide a simple API test
async function testAPICompatibility() {
  console.log('\n🧪 Testing API compatibility...');
  
  try {
    // Test if we can get embeddings for API calls
    const { data: sampleNarrative } = await supabaseAdmin
      .from('narratives')
      .select('crd_number, narrative')
      .not('embedding_vector', 'is', null)
      .limit(1)
      .single();
    
    if (sampleNarrative) {
      console.log(`✅ Vector data available for CRD ${sampleNarrative.crd_number}`);
      console.log(`✅ API endpoints can query vector embeddings`);
    } else {
      console.log('❌ No vector data available for API testing');
    }
    
  } catch (error) {
    console.log('❌ API compatibility test failed');
  }
}

// Run verification
if (require.main === module) {
  verifyPhase1Migration()
    .then(async (status) => {
      await testAPICompatibility();
      
      console.log('\n✨ Next Steps:');
      if (status.conversionRate < 100) {
        console.log('1. Complete the SQL migration in Supabase SQL Editor');
        console.log('2. Run batch conversion for all embeddings');
      }
      if (!status.functionsAvailable) {
        console.log('3. Create vector search functions');
      }
      if (status.conversionRate === 100) {
        console.log('4. Create HNSW indexes for maximum performance');
        console.log('5. Begin Phase 2: ETL Pipeline for missing narratives');
      }
      
      process.exit(0);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export { verifyPhase1Migration };
