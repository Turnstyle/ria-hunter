// Check current state of embeddings properly
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmbeddingsState() {
  console.log('📊 Current embeddings state in narratives table:');
  console.log('='.repeat(50));
  
  try {
    // Total narratives
    const { count: total } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    // With embeddings
    const { count: withEmbeddings } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    // Without embeddings  
    const { count: withoutEmbeddings } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    console.log(`📋 Total narratives: ${total}`);
    console.log(`✅ With embeddings: ${withEmbeddings}`);
    console.log(`❌ Without embeddings: ${withoutEmbeddings}`);

    // Check if any embeddings exist to see their format
    if (withEmbeddings > 0) {
      const { data: sample } = await supabase
        .from('narratives')
        .select('id, embedding')
        .not('embedding', 'is', null)
        .limit(1);

      if (sample && sample.length > 0) {
        const embedding = sample[0].embedding;
        console.log(`🔍 Sample embedding type: ${typeof embedding}`);
        
        if (typeof embedding === 'string') {
          try {
            const parsed = JSON.parse(embedding);
            console.log(`📐 Parsed embedding dimension: ${parsed.length}`);
          } catch (e) {
            console.log(`⚠️  Embedding is not valid JSON`);
          }
        } else if (Array.isArray(embedding)) {
          console.log(`📐 Direct array embedding dimension: ${embedding.length}`);
        }
      }
    }

    console.log('\n🎯 Action needed:');
    if (withoutEmbeddings > 0) {
      console.log(`   • Generate embeddings for ${withoutEmbeddings} narratives`);
    }
    if (withEmbeddings > 0) {
      console.log(`   • Verify ${withEmbeddings} existing embeddings are vector(768) format`);
    }

  } catch (err) {
    console.error('💥 Check failed:', err.message);
  }
  
  console.log('='.repeat(50));
}

checkEmbeddingsState();
