import { supabaseAdmin } from './lib/supabaseAdmin';

async function parseEmbedding() {
  try {
    // Get one embedding to understand format
    const { data: narratives, error } = await supabaseAdmin
      .from('narratives')
      .select('crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (narratives && narratives.length > 0) {
      const embeddingStr = narratives[0].embedding as string;
      
      console.log('📊 Embedding analysis:');
      console.log(`- CRD: ${narratives[0].crd_number}`);
      console.log(`- String length: ${embeddingStr.length}`);
      
      try {
        // Try to parse as JSON array
        const embeddingArray = JSON.parse(embeddingStr);
        
        if (Array.isArray(embeddingArray)) {
          console.log(`- Dimensions: ${embeddingArray.length}`);
          console.log(`- First 5 values: [${embeddingArray.slice(0, 5).join(', ')}]`);
          console.log(`- Data type: ${typeof embeddingArray[0]}`);
          
          // Determine likely model based on dimensions
          if (embeddingArray.length === 768) {
            console.log('✅ Already 768 dimensions - compatible with plan!');
          } else if (embeddingArray.length === 384) {
            console.log('❌ 384 dimensions - needs migration to 768');
          } else if (embeddingArray.length === 1536) {
            console.log('⚠️ 1536 dimensions (OpenAI ada-002)');
          } else {
            console.log(`⚠️ Unexpected dimensions: ${embeddingArray.length}`);
          }
          
        } else {
          console.log('❌ Not an array after parsing');
        }
      } catch (parseError) {
        console.log('❌ Could not parse as JSON:', parseError);
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

parseEmbedding();
