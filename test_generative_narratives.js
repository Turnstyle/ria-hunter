/**
 * Test the generative narratives process end-to-end
 * This script tests both the database function and the API endpoint
 */

require('dotenv').config({ path: './env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testGenerativeNarratives() {
  console.log('🧪 Testing Generative Narratives Process');
  console.log('=======================================\n');
  
  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Step 1: Check if narratives table has vector embeddings
  console.log('📋 Step 1: Checking vector embeddings in database...');
  
  const { data: vectorStats, error: vectorError } = await supabase
    .from('narratives')
    .select('embedding_vector')
    .not('embedding_vector', 'is', null)
    .limit(1);
  
  if (vectorError) {
    console.error('❌ Error checking vector embeddings:', vectorError.message);
    return;
  }
  
  if (!vectorStats || vectorStats.length === 0) {
    console.error('❌ No vector embeddings found in the database');
    console.log('   You need to run the FIX_GENERATIVE_NARRATIVES.sql script first');
    return;
  }
  
  console.log('✅ Vector embeddings found in database\n');
  
  // Step 2: Test match_narratives RPC with a test embedding
  console.log('📋 Step 2: Testing match_narratives RPC...');
  
  // Create a test embedding (random vector)
  const testEmbedding = new Array(768).fill(0).map(() => Math.random() * 0.1 - 0.05);
  
  try {
    const { data: rpcResults, error: rpcError } = await supabase.rpc('match_narratives', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 5
    });
    
    if (rpcError) {
      console.error('❌ RPC Error:', rpcError);
      return;
    }
    
    console.log(`✅ RPC returned ${rpcResults.length} results`);
    
    if (rpcResults.length > 0) {
      const firstResult = rpcResults[0];
      console.log('   First result:');
      console.log(`   - CRD: ${firstResult.crd_number}`);
      console.log(`   - Similarity: ${firstResult.similarity.toFixed(4)}`);
      console.log(`   - Legal Name: ${firstResult.legal_name}`);
      console.log(`   - Has narrative: ${firstResult.narrative ? 'Yes' : 'No'}`);
    }
    
    console.log();
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return;
  }
  
  // Step 3: Test vector dimensions
  console.log('📋 Step 3: Checking embedding vector dimensions...');
  
  try {
    const { data: vectorData, error: dimensionError } = await supabase
      .from('narratives')
      .select('embedding_vector')
      .not('embedding_vector', 'is', null)
      .limit(1)
      .single();
    
    if (dimensionError) {
      console.error('❌ Error checking dimensions:', dimensionError.message);
      return;
    }
    
    const vectorLength = Array.isArray(vectorData.embedding_vector) 
      ? vectorData.embedding_vector.length 
      : 'Not an array';
      
    console.log(`✅ Vector dimensions: ${vectorLength}`);
    
    if (vectorLength !== 768) {
      console.warn('⚠️ WARNING: Expected 768 dimensions but found', vectorLength);
    }
    
    console.log();
  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
  
  // Step 4: Test API endpoint for semantic search
  console.log('📋 Step 4: Testing semantic search API...');
  
  // Test query that should use semantic search
  const testQuery = "RIAs specializing in retirement planning";
  
  try {
    // You may need to adjust the API URL based on your environment
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ria-hunter.app/api';
    const response = await fetch(`${apiUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery })
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: HTTP ${response.status}`);
      return;
    }
    
    const data = await response.json();
    
    // Check search strategy
    const searchStrategy = data.metadata?.searchStrategy || 'unknown';
    console.log(`✅ Search strategy: ${searchStrategy}`);
    
    if (!searchStrategy.includes('semantic')) {
      console.warn('⚠️ WARNING: Not using semantic search - got', searchStrategy);
    }
    
    // Check confidence score
    const confidence = data.metadata?.confidence || 0;
    console.log(`✅ Confidence score: ${confidence}`);
    
    // Check results
    const results = data.sources || [];
    console.log(`✅ Results: Found ${results.length} sources`);
    
    if (results.length > 0) {
      console.log('   Top results:');
      results.slice(0, 3).forEach((result, i) => {
        console.log(`   ${i+1}. ${result.legal_name || 'Unknown'} (${result.similarity || 'N/A'})`);
      });
    }
    
  } catch (err) {
    console.error('❌ API Test Exception:', err.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testGenerativeNarratives().catch(console.error);
