// Clear existing string embeddings and verify setup for regeneration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAndPrepareEmbeddings() {
  console.log('🧹 Preparing for fresh embedding generation');
  console.log('='.repeat(60));
  
  try {
    // Check current state
    const { count: totalBefore } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    const { count: withEmbeddingsBefore } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`📊 Before clearing:`);
    console.log(`   Total narratives: ${totalBefore}`);
    console.log(`   With embeddings: ${withEmbeddingsBefore}`);

    if (withEmbeddingsBefore > 0) {
      console.log('\n🧹 Clearing existing embeddings...');
      
      const { error: clearError } = await supabase
        .from('narratives')
        .update({ embedding: null })
        .not('embedding', 'is', null);

      if (clearError) {
        console.log('❌ Error clearing embeddings:', clearError);
        return;
      }

      console.log('✅ Embeddings cleared successfully');
    }

    // Verify cleared state
    const { count: withEmbeddingsAfter } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`\n📊 After clearing:`);
    console.log(`   Total narratives: ${totalBefore}`);
    console.log(`   With embeddings: ${withEmbeddingsAfter}`);
    console.log(`   Ready for embedding: ${totalBefore - withEmbeddingsAfter}`);

    // Verify we have RIA profiles for foreign key constraints
    const { count: riaProfiles } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📋 Related data:`);
    console.log(`   RIA profiles: ${riaProfiles}`);

    if (riaProfiles === 0) {
      console.log('⚠️  Warning: No RIA profiles found. The pipeline may need to load profile data first.');
    }

    // Sample a few narratives to verify structure
    const { data: sample } = await supabase
      .from('narratives')
      .select('id, crd_number, narrative')
      .limit(3);

    console.log(`\n📄 Sample narratives ready for embedding:`);
    sample.forEach((record, index) => {
      console.log(`   ${index + 1}. CRD ${record.crd_number}: "${record.narrative.substring(0, 80)}..."`);
    });

  } catch (err) {
    console.error('💥 Setup failed:', err.message);
  }
  
  console.log('='.repeat(60));
  console.log('🏁 Ready for embedding pipeline');
}

clearAndPrepareEmbeddings();
