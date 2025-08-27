/**
 * Check the format of embeddings in the narratives table
 */

require('dotenv').config({ path: './env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkEmbeddingFormat() {
  console.log('🔍 Checking Embedding Format in Database');
  console.log('=========================================\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get a few narratives with embeddings
  console.log('📋 Fetching sample narratives with embeddings...\n');
  
  const { data, error } = await supabase
    .from('narratives')
    .select('crd_number, embedding')
    .not('embedding', 'is', null)
    .limit(3);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('⚠️ No narratives with embeddings found');
    return;
  }
  
  console.log(`Found ${data.length} narratives with embeddings\n`);
  
  data.forEach((row, index) => {
    console.log(`📊 Narrative ${index + 1} (CRD: ${row.crd_number}):`);
    
    const embedding = row.embedding;
    
    // Check the type
    console.log(`   Type: ${typeof embedding}`);
    console.log(`   Is Array: ${Array.isArray(embedding)}`);
    
    // If it's a string, check if it looks like JSON
    if (typeof embedding === 'string') {
      console.log(`   String length: ${embedding.length} characters`);
      console.log(`   First 100 chars: ${embedding.substring(0, 100)}`);
      
      // Try to parse it
      try {
        const parsed = JSON.parse(embedding);
        console.log(`   ✅ Can be parsed as JSON`);
        console.log(`   Parsed type: ${typeof parsed}`);
        console.log(`   Parsed is array: ${Array.isArray(parsed)}`);
        if (Array.isArray(parsed)) {
          console.log(`   Array length: ${parsed.length}`);
          console.log(`   First 3 values: [${parsed.slice(0, 3).join(', ')}]`);
        }
      } catch (e) {
        console.log(`   ❌ Cannot parse as JSON`);
      }
    } else if (Array.isArray(embedding)) {
      console.log(`   Array length: ${embedding.length}`);
      console.log(`   First 3 values: [${embedding.slice(0, 3).join(', ')}]`);
    } else {
      console.log(`   Unknown format!`);
      console.log(`   Value:`, embedding);
    }
    
    console.log('');
  });
  
  // Check the column type in the database
  console.log('📋 Checking database column type...\n');
  
  const { data: columnData, error: columnError } = await supabase.rpc('get_columns', {
    table_name: 'narratives'
  }).catch(() => ({ data: null, error: 'RPC not available' }));
  
  if (columnError) {
    console.log('⚠️ Cannot check column types (RPC may not exist)');
  } else if (columnData) {
    const embeddingCol = columnData.find(col => col.column_name === 'embedding');
    if (embeddingCol) {
      console.log('Embedding column type:', embeddingCol.data_type);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS:');
  console.log('='.repeat(60));
  console.log('\nIf embeddings are stored as:');
  console.log('- JSON strings → Need to parse before using');
  console.log('- Text → Wrong format, need to convert to vector');
  console.log('- vector(768) → Correct format for pgvector');
  console.log('- Array → Should work if properly formatted');
}

checkEmbeddingFormat().catch(console.error);
