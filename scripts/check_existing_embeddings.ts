// Check format of existing embeddings
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkExistingEmbeddings() {
  try {
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(5);

    if (error) {
      console.error('Error fetching embeddings:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log('📊 Existing embedding analysis:');
      data.forEach((row, index) => {
        const embedding = row.embedding;
        console.log(`\nEmbedding ${index + 1}:`);
        console.log(`- CRD: ${row.crd_number}`);
        console.log(`- Dimensions: ${embedding?.length || 'undefined'}`);
        console.log(`- Type: ${typeof embedding}`);
        console.log(`- Sample values: [${embedding?.slice(0, 5).join(', ')}...]`);
      });
      
      // Determine likely model used
      const dimensions = data[0].embedding?.length;
      console.log(`\n🔍 Analysis:`);
      if (dimensions === 1536) {
        console.log('- Legacy 1536-dimensional embeddings detected (replace with Vertex AI 768-dim embeddings)');
      } else if (dimensions === 768) {
        console.log('- Likely Vertex AI textembedding-gecko (768 dimensions)');
      } else if (dimensions === 384) {
        console.log('- Likely older embedding model (384 dimensions, should be upgraded to 768)');
      } else {
        console.log(`- Unknown model type (${dimensions} dimensions)`);
      }
    } else {
      console.log('No existing embeddings found');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkExistingEmbeddings();
