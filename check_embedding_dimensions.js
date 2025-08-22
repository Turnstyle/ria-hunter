// Check the current embedding dimensions and format
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (function() {
  const fs = require('fs');
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeEmbeddings() {
  console.log('Analyzing current embeddings format and dimensions:');
  console.log('='.repeat(60));
  
  try {
    // Get a sample of embeddings to analyze
    const { data, error } = await supabase
      .from('narratives')
      .select('id, narrative, embedding')
      .not('embedding', 'is', null)
      .limit(5);

    if (error) {
      console.error('Error fetching embeddings:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('No embeddings found');
      return;
    }

    console.log(`Found ${data.length} sample embeddings to analyze:`);
    
    data.forEach((record, index) => {
      console.log(`\n📄 Record ${index + 1} (ID: ${record.id}):`);
      console.log(`   📝 Narrative preview: "${record.narrative.substring(0, 100)}..."`);
      
      const embedding = record.embedding;
      console.log(`   🔢 Embedding type: ${typeof embedding}`);
      
      if (typeof embedding === 'string') {
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(embedding);
          if (Array.isArray(parsed)) {
            console.log(`   📐 Parsed dimension: ${parsed.length}`);
            console.log(`   📊 First 3 values: [${parsed.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`);
            console.log(`   📊 Last 3 values: [${parsed.slice(-3).map(v => v.toFixed(4)).join(', ')}...]`);
            console.log(`   ✅ Valid JSON array format`);
          } else {
            console.log(`   ❌ Not an array after parsing: ${typeof parsed}`);
          }
        } catch (parseErr) {
          console.log(`   ❌ JSON parse failed: ${parseErr.message}`);
          console.log(`   📄 Raw embedding sample: "${embedding.substring(0, 100)}..."`);
        }
      } else if (Array.isArray(embedding)) {
        console.log(`   📐 Direct array dimension: ${embedding.length}`);
        console.log(`   📊 First 3 values: [${embedding.slice(0, 3).join(', ')}...]`);
      } else {
        console.log(`   ❓ Unexpected format: ${JSON.stringify(embedding).substring(0, 100)}...`);
      }
    });

    // Check total embedding counts
    const { count: totalEmbeddings } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    const { count: nullEmbeddings } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    console.log(`\n📊 Summary:`);
    console.log(`   Total narratives: ${totalEmbeddings + nullEmbeddings}`);
    console.log(`   With embeddings: ${totalEmbeddings}`);
    console.log(`   Without embeddings: ${nullEmbeddings}`);

  } catch (err) {
    console.error('Analysis error:', err.message);
  }
  
  console.log('='.repeat(60));
}

analyzeEmbeddings();