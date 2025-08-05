// Clear the fake placeholder embeddings to start fresh
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearFakeEmbeddings() {
  console.log('🧹 Clearing fake placeholder embeddings...');
  
  try {
    // Clear all embeddings (they're fake anyway)
    const { error } = await supabase
      .from('narratives')
      .update({ embedding: null })
      .not('embedding', 'is', null);

    if (error) {
      console.error('Error clearing embeddings:', error);
      return;
    }
    
    // Check the result
    const { count: remainingCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    const { count: totalCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
    
    console.log('✅ Cleared fake embeddings successfully!');
    console.log(`📊 Total narratives: ${totalCount}`);
    console.log(`📊 Remaining embeddings: ${remainingCount}`);
    console.log('🚀 Ready for real Vertex AI embeddings!');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

clearFakeEmbeddings();