// Quick script to monitor Phase 1 progress in real-time
import { supabaseAdmin } from './lib/supabaseAdmin';

async function monitorProgress() {
  console.log('🔄 Monitoring Phase 1 Migration Progress...\n');
  
  let attempts = 0;
  const maxAttempts = 60; // Monitor for 5 minutes (5-second intervals)
  
  while (attempts < maxAttempts) {
    try {
      const { count: totalNarratives } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' });
      
      const { count: stringEmbeddings } = await supabaseAdmin
        .from('narratives')
        .select('*', { head: true, count: 'exact' })
        .not('embedding', 'is', null);
      
      let vectorEmbeddings = 0;
      let columnExists = false;
      
      try {
        const { count: vectorCount } = await supabaseAdmin
          .from('narratives')
          .select('*', { head: true, count: 'exact' })
          .not('embedding_vector', 'is', null);
        
        vectorEmbeddings = vectorCount || 0;
        columnExists = true;
      } catch (error: any) {
        columnExists = false;
      }
      
      const conversionRate = stringEmbeddings ? (vectorEmbeddings / stringEmbeddings) * 100 : 0;
      
      // Clear line and print status
      process.stdout.write('\r\x1b[K'); // Clear current line
      
      if (!columnExists) {
        process.stdout.write('⏳ Waiting for SQL execution to begin...');
      } else if (vectorEmbeddings === 0) {
        process.stdout.write('🔧 Vector column created! Waiting for conversion to start...');
      } else if (vectorEmbeddings < stringEmbeddings) {
        process.stdout.write(`🔄 Converting embeddings: ${vectorEmbeddings}/${stringEmbeddings} (${conversionRate.toFixed(1)}%)`);
      } else {
        process.stdout.write(`✅ Migration complete! ${vectorEmbeddings} embeddings converted (100%)`);
        console.log('\n\n🎉 Phase 1 Vector Migration Complete!');
        
        // Test search function
        try {
          const { data: testResult } = await supabaseAdmin
            .rpc('match_narratives', {
              query_embedding: Array(768).fill(0.1),
              match_threshold: 0.1,
              match_count: 1
            });
          
          if (testResult && testResult.length > 0) {
            console.log('✅ Search functions are working!');
            console.log('✅ Ready for HNSW index creation');
          }
        } catch (funcError) {
          console.log('⚠️ Search functions need to be created next');
        }
        
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
      
    } catch (error) {
      console.error('\n❌ Monitoring error:', error);
      break;
    }
  }
  
  if (attempts >= maxAttempts) {
    console.log('\n⏰ Monitoring timeout reached. Check status manually.');
  }
}

monitorProgress();
