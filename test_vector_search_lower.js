// Test the vector search performance with lower threshold
require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSearch() {
  console.log('Testing vector search with lower threshold...');
  
  // Create a test vector (all 0.1 values)
  const testVector = Array(768).fill(0.1);
  
  const startTime = Date.now();
  
  try {
    // Call the match_narratives function with a very low threshold
    const { data, error } = await supabase.rpc('match_narratives', {
      query_embedding: testVector,
      match_threshold: 0.1,  // Very low threshold
      match_count: 5
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log(`✅ Search completed in ${duration}ms`);
      console.log(`Found ${data?.length || 0} results`);
      
      if (data && data.length > 0) {
        console.log('\nFirst result:');
        console.log('CRD Number:', data[0].crd_number);
        console.log('Similarity:', data[0].similarity);
        console.log('Narrative:', data[0].narrative?.substring(0, 100) + '...');
      } else {
        console.log('No results found.');
        
        // If no results, try getting a sample embedding to test with
        console.log('\nTrying to get a sample embedding...');
        const { data: sampleData } = await supabase
          .from('narratives')
          .select('*')
          .not('embedding_vector', 'is', null)
          .limit(1);
        
        if (sampleData && sampleData.length > 0) {
          console.log('Sample embedding found. Try using this for testing.');
        } else {
          console.log('No sample embeddings found.');
        }
      }
      
      // Performance assessment
      if (duration < 10) {
        console.log('\n🚀 EXCELLENT PERFORMANCE! (<10ms)');
        console.log('The HNSW index is working perfectly!');
      } else if (duration < 50) {
        console.log('\n⚡ VERY GOOD PERFORMANCE (<50ms)');
        console.log('The HNSW index is working well.');
      } else if (duration < 200) {
        console.log('\n✓ GOOD PERFORMANCE (<200ms)');
      } else if (duration < 1000) {
        console.log('\n⚠️ MEDIOCRE PERFORMANCE (<1000ms)');
        console.log('The HNSW index might not be used optimally.');
      } else {
        console.log('\n❌ SLOW PERFORMANCE (>1000ms)');
        console.log('The HNSW index might not be being used.');
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testSearch();
