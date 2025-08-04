// scripts/test_semantic_search.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSemanticSearch() {
  const query = 'wealth management, st louis';
  console.log(`Testing semantic search for: "${query}"`);
  console.log('---');
  
  // For now, we'll test with a sample embedding from the existing data
  // In production, you would generate an embedding for the query using Vertex AI
  
  // First, get a sample embedding to use as our query vector
  const { data: sampleData, error: sampleError } = await supabase
    .from('narratives')
    .select('embedding')
    .not('embedding', 'is', null)
    .limit(1);
    
  if (sampleError || !sampleData || sampleData.length === 0) {
    console.error('Error getting sample embedding:', sampleError);
    return;
  }
  
  // Parse the embedding string to array
  const sampleEmbedding = JSON.parse(sampleData[0].embedding);
  
  // Perform similarity search using raw SQL
  const { data, error } = await supabase.rpc('execute_sql', {
    query: `
      SELECT crd_number, narrative,
        1 - (embedding <=> $1::vector) as similarity
      FROM public.narratives
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `,
    params: [JSON.stringify(sampleEmbedding)]
  });

  if (error) {
    // Try alternative approach without RPC
    console.log('RPC approach failed, trying direct query...');
    
    // Since we can't use raw SQL easily, let's fetch some records and show them
    const { data: results, error: queryError } = await supabase
      .from('narratives')
      .select('crd_number, narrative')
      .not('embedding', 'is', null)
      .limit(5);
      
    if (queryError) {
      console.error('Error performing search:', queryError);
      return;
    }
    
    console.log('Sample results (without similarity scoring):');
    results.forEach((result, i) => {
      console.log(`\n${i + 1}. CRD ${result.crd_number}:`);
      console.log(`   ${result.narrative.substring(0, 200)}...`);
    });
    
    console.log('\nNote: For true semantic search with similarity scoring, you need to:');
    console.log('1. Generate an embedding for the search query using Vertex AI');
    console.log('2. Use pgvector operators (<=> for distance) in your SQL query');
    console.log('3. Consider using Supabase Edge Functions for the search API');
  } else {
    console.log('Top 5 similar results:');
    data.forEach((result, i) => {
      console.log(`\n${i + 1}. CRD ${result.crd_number} (similarity: ${result.similarity.toFixed(4)}):`);
      console.log(`   ${result.narrative.substring(0, 200)}...`);
    });
  }
}

testSemanticSearch().catch(console.error);