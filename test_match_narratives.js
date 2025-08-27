/**
 * Test the match_narratives RPC to see if it exists and works
 */

require('dotenv').config({ path: './env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testMatchNarratives() {
  console.log('🧪 Testing match_narratives RPC');
  console.log('================================\n');
  
  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // First, let's generate a test embedding
  console.log('📋 Step 1: Generate test embedding...');
  
  // Create a simple 768-dimensional embedding (just for testing)
  const testEmbedding = new Array(768).fill(0).map(() => Math.random() * 0.1 - 0.05);
  console.log(`✅ Generated test embedding with ${testEmbedding.length} dimensions\n`);
  
  // Test the RPC
  console.log('📋 Step 2: Call match_narratives RPC...');
  
  try {
    const { data, error } = await supabase.rpc('match_narratives', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,  // Very low threshold to get any results
      match_count: 5
    });
    
    if (error) {
      console.error('❌ RPC Error:', error);
      console.log('\n💡 Common errors:');
      console.log('   - Function does not exist: Need to create the RPC');
      console.log('   - Invalid input: Wrong parameter types');
      console.log('   - Permission denied: RPC not public');
      return;
    }
    
    console.log('✅ RPC call successful!\n');
    console.log(`📊 Results: Found ${data ? data.length : 0} matches`);
    
    if (data && data.length > 0) {
      console.log('\n🔍 First result:');
      console.log(`   CRD: ${data[0].crd_number}`);
      console.log(`   Similarity: ${data[0].similarity}`);
      console.log(`   Has narrative: ${data[0].narrative ? 'Yes' : 'No'}`);
    } else {
      console.log('\n⚠️ No matches found. This could mean:');
      console.log('   - No narratives with embeddings in database');
      console.log('   - Threshold too high');
      console.log('   - Index not created');
    }
    
  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
  
  // Check if narratives table exists and has data
  console.log('\n📋 Step 3: Check narratives table...');
  
  const { data: countData, error: countError } = await supabase
    .from('narratives')
    .select('crd_number', { count: 'exact', head: true });
  
  if (countError) {
    console.error('❌ Cannot access narratives table:', countError.message);
  } else {
    console.log(`✅ Narratives table has ${countData} records`);
  }
  
  // Check if narratives have embeddings
  console.log('\n📋 Step 4: Check for embeddings...');
  
  const { data: sampleNarrative, error: sampleError } = await supabase
    .from('narratives')
    .select('crd_number, embedding')
    .not('embedding', 'is', null)
    .limit(1)
    .single();
  
  if (sampleError) {
    console.error('❌ Cannot check embeddings:', sampleError.message);
  } else if (sampleNarrative && sampleNarrative.embedding) {
    console.log(`✅ Found narrative with embedding`);
    console.log(`   CRD: ${sampleNarrative.crd_number}`);
    console.log(`   Embedding dimensions: ${Array.isArray(sampleNarrative.embedding) ? sampleNarrative.embedding.length : 'Not an array'}`);
  } else {
    console.log('⚠️ No narratives with embeddings found!');
    console.log('   This is why semantic search is failing!');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testMatchNarratives().catch(console.error);
