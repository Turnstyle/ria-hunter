// Verify the new embeddings are working correctly
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyEmbeddings() {
  console.log('🔍 Verifying the new Vertex AI embeddings...');
  
  try {
    // Check how many narratives now have embeddings
    const { data: withEmbeddings, error: embeddingError } = await supabase
      .from('narratives')
      .select('crd_number, narrative, embedding')
      .not('embedding', 'is', null)
      .limit(5);

    if (embeddingError) {
      console.error('❌ Error fetching embeddings:', embeddingError);
      return;
    }

    console.log(`✅ Found ${withEmbeddings?.length || 0} narratives with embeddings`);
    
    if (withEmbeddings && withEmbeddings.length > 0) {
      for (const row of withEmbeddings) {
        const embeddingLength = Array.isArray(row.embedding) ? row.embedding.length : 'unknown';
        console.log(`📊 CRD ${row.crd_number}: ${embeddingLength} dimensions`);
        console.log(`   📄 "${row.narrative.substring(0, 80)}..."`);
        
        if (Array.isArray(row.embedding)) {
          // Show first few values to verify they're real numbers
          const firstFew = row.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ');
          console.log(`   🔢 First 5 values: [${firstFew}, ...]`);
        }
        console.log('');
      }
    }

    // Count total narratives with and without embeddings
    const { count: totalCount, error: totalError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    const { count: embeddedCount, error: embeddedCountError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (!totalError && !embeddedCountError) {
      const remaining = (totalCount || 0) - (embeddedCount || 0);
      console.log(`📈 Progress Summary:`);
      console.log(`   Total narratives: ${totalCount}`);
      console.log(`   With embeddings: ${embeddedCount}`);
      console.log(`   Remaining to embed: ${remaining}`);
      console.log(`   Progress: ${((embeddedCount || 0) / (totalCount || 1) * 100).toFixed(2)}%`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyEmbeddings().catch(console.error);