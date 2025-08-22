const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyTable() {
  console.log('🔍 Verifying new narratives table...\n');
  
  // Check if table exists and is empty
  const { count, error } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.log('❌ Error accessing narratives table:', error.message);
    return;
  }
  
  console.log(`✅ narratives table exists with ${count} rows (should be 0)`);
  
  // Check RIA profiles count to see how many narratives we need to generate
  const { count: riaCount } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📋 RIA profiles available: ${riaCount}`);
  console.log(`🎯 Ready to generate ~${riaCount * 2} narratives with vector(768) embeddings`);
  
  console.log('\n🚀 READY TO START FRESH EMBEDDING PIPELINE!');
}

verifyTable();
