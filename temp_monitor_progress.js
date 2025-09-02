const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitorProgress() {
  console.log('📊 RIA Hunter - Phase 2 Progress Monitor');
  console.log('=' .repeat(50));
  
  try {
    // Get current counts
    const { count: riaCount } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
      
    const { count: embeddingCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
      
    const { count: undefinedCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .ilike('narrative', 'Undefined (%');
    
    // Calculate progress
    const narrativeProgress = ((narrativeCount / riaCount) * 100).toFixed(2);
    const embeddingProgress = ((embeddingCount / narrativeCount) * 100).toFixed(2);
    const remainingNarratives = riaCount - narrativeCount;
    const remainingEmbeddings = narrativeCount - embeddingCount;
    
    console.log(`📈 Database Status:`);
    console.log(`   Total RIAs: ${riaCount?.toLocaleString()}`);
    console.log(`   Narratives: ${narrativeCount?.toLocaleString()} (${narrativeProgress}% coverage)`);
    console.log(`   Embeddings: ${embeddingCount?.toLocaleString()} (${embeddingProgress}% of narratives)`);
    console.log(`   Undefined Narratives: ${undefinedCount?.toLocaleString()}`);
    
    console.log(`\n🎯 Remaining Work:`);
    console.log(`   Narratives needed: ${remainingNarratives?.toLocaleString()}`);
    console.log(`   Embeddings needed: ${remainingEmbeddings?.toLocaleString()}`);
    console.log(`   Undefined to fix: ${undefinedCount?.toLocaleString()}`);
    
    // Check script progress files
    console.log(`\n🔧 Script Status:`);
    
    // Direct narrative generator progress
    try {
      const directProgress = JSON.parse(fs.readFileSync('logs/direct_narrative_progress.json', 'utf8'));
      console.log(`   Direct Generator: ${directProgress.successful} new narratives created`);
      console.log(`     Last processed CRD: ${directProgress.lastProcessedCRD}`);
    } catch (e) {
      console.log(`   Direct Generator: Progress file not found`);
    }
    
    // Reprocess script progress  
    try {
      const reprocessProgress = JSON.parse(fs.readFileSync('logs/corrected_reprocess_progress.json', 'utf8'));
      console.log(`   Reprocess Script: ${reprocessProgress.successful} undefined narratives fixed`);
      console.log(`     Last processed CRD: ${reprocessProgress.lastProcessedCRD}`);
    } catch (e) {
      console.log(`   Reprocess Script: Progress file not found`);
    }
    
    // Calculate estimated completion
    if (undefinedCount <= 10) {
      console.log(`\n🎉 MILESTONE: Undefined narrative cleanup nearly complete!`);
    }
    
    if (narrativeProgress >= 95) {
      console.log(`\n🎉 MILESTONE: Narrative generation nearly complete!`);
    }
    
    // Save snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      riaCount,
      narrativeCount,
      embeddingCount,
      undefinedCount,
      narrativeProgress: parseFloat(narrativeProgress),
      embeddingProgress: parseFloat(embeddingProgress)
    };
    
    fs.writeFileSync('logs/progress_snapshot.json', JSON.stringify(snapshot, null, 2));
    console.log(`\n💾 Progress snapshot saved to logs/progress_snapshot.json`);
    
  } catch (error) {
    console.error('❌ Error monitoring progress:', error);
  }
}

monitorProgress();
