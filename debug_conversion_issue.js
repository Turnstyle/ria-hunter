const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugConversionIssue() {
  console.log('🔍 DEBUGGING CONVERSION ISSUE\n');
  
  // 1. Check what's actually in the embedding column
  console.log('1. Checking embedding format...');
  const { data: sample, error: sampleError } = await supabase
    .from('narratives')
    .select('crd_number, embedding')
    .not('embedding', 'is', null)
    .limit(3);
  
  if (sampleError) {
    console.log('❌ Error getting sample:', sampleError.message);
    return;
  }
  
  if (sample) {
    sample.forEach((row, i) => {
      console.log(`Sample ${i + 1}:`);
      console.log(`  CRD: ${row.crd_number}`);
      console.log(`  Type: ${typeof row.embedding}`);
      console.log(`  Length: ${row.embedding.toString().length} chars`);
      console.log(`  First 100 chars: ${row.embedding.toString().substring(0, 100)}...`);
      console.log(`  Looks like JSON: ${row.embedding.toString().startsWith('[')}`);
      
      // Try to parse it
      try {
        const parsed = JSON.parse(row.embedding.toString());
        console.log(`  ✅ Parseable JSON with ${parsed.length} elements`);
      } catch (e) {
        console.log(`  ❌ Not parseable JSON: ${e.message}`);
      }
      console.log('');
    });
  }
  
  // 2. Test the simplest possible conversion
  console.log('2. Testing simple conversion...');
  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        UPDATE narratives 
        SET embedding_vector = embedding::text::vector(768)
        WHERE crd_number = '373'
        RETURNING crd_number, array_length(embedding_vector::float[], 1) as dims;
      `
    });
    
    if (error) {
      console.log('❌ Simple conversion failed:', error.message);
      
      // Try alternative approach
      console.log('\n3. Trying alternative conversion method...');
      const altQuery = `
        SELECT 
          crd_number,
          ARRAY(SELECT json_array_elements_text(embedding::json)::float) as converted_array
        FROM narratives 
        WHERE crd_number = '373'
        LIMIT 1;
      `;
      
      const { data: altData, error: altError } = await supabase.rpc('sql', { query: altQuery });
      
      if (altError) {
        console.log('❌ Alternative method also failed:', altError.message);
      } else {
        console.log('✅ Alternative method worked!');
        console.log('This means we need to use the ARRAY(SELECT json_array_elements_text()) approach');
      }
    } else {
      console.log('✅ Simple conversion worked!');
    }
  } catch (e) {
    console.log('❌ RPC call failed:', e.message);
    
    // The issue might be that we can't run raw SQL via RPC
    console.log('\n⚠️  Cannot run raw SQL via RPC. The issue is likely:');
    console.log('1. Supabase timeout limits are too strict for batch operations');
    console.log('2. The JSON parsing is computationally expensive');
    console.log('3. We need to use a different approach');
  }
  
  // 4. Test if the function itself works with tiny batches
  console.log('\n4. Testing function with batch size 1...');
  const { data: funcTest, error: funcError } = await supabase.rpc('convert_embeddings_batch', {
    batch_size: 1
  });
  
  if (funcError) {
    console.log('❌ Function fails even with batch size 1:', funcError.message);
    
    if (funcError.message.includes('timeout')) {
      console.log('\n💡 SOLUTION: The timeout is happening during the conversion itself');
      console.log('We need to either:');
      console.log('1. Use Supabase Edge Functions (run on Deno, longer timeouts)');
      console.log('2. Use direct SQL in Supabase dashboard (no RPC timeout limits)');
      console.log('3. Use a different conversion approach that\'s faster');
    }
  } else {
    console.log('✅ Function works with batch size 1');
    console.log('Result:', funcTest[0]);
  }
}

debugConversionIssue().catch(console.error);
