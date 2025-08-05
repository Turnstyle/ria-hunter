// Examine the actual embedding data format
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function examineEmbeddingData() {
  try {
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(1);

    if (error) {
      console.error('Error fetching embeddings:', error);
      return;
    }

    if (data && data.length > 0) {
      const row = data[0];
      const embedding = row.embedding;
      
      console.log('🔍 Raw embedding data examination:');
      console.log('- CRD:', row.crd_number);
      console.log('- Data type:', typeof embedding);
      console.log('- Is array:', Array.isArray(embedding));
      console.log('- Length/size:', embedding?.length);
      
      if (typeof embedding === 'string') {
        console.log('- First 200 chars:', embedding.substring(0, 200));
        console.log('- Looks like JSON?', embedding.startsWith('[') || embedding.startsWith('{'));
        
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(embedding);
          console.log('- Parsed successfully! Type:', typeof parsed);
          console.log('- Parsed is array:', Array.isArray(parsed));
          if (Array.isArray(parsed)) {
            console.log('- Parsed array length:', parsed.length);
            console.log('- First few values:', parsed.slice(0, 5));
          }
        } catch (parseError) {
          console.log('- Failed to parse as JSON:', parseError.message.substring(0, 100));
        }
      } else if (Array.isArray(embedding)) {
        console.log('- First few values:', embedding.slice(0, 5));
      }
    } else {
      console.log('No embeddings found');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

examineEmbeddingData();