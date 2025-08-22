// Check the current narratives table structure and add missing constraint
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeNarrativesTable() {
  console.log('🔍 Analyzing narratives table structure');
  console.log('='.repeat(50));
  
  try {
    // Check current record count
    const { count: totalCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Current narratives: ${totalCount}`);

    // Check for duplicate crd_numbers
    const { data: sampleData } = await supabase
      .from('narratives')
      .select('crd_number')
      .limit(10);

    console.log(`📄 Sample crd_numbers:`, sampleData.map(r => r.crd_number));

    // Try to detect duplicates by getting counts
    const crdNumbers = {};
    let offset = 0;
    let hasMore = true;
    
    console.log('🔍 Checking for duplicate crd_numbers...');
    
    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('narratives')
        .select('crd_number')
        .range(offset, offset + 999);

      if (error || !batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      batch.forEach(record => {
        crdNumbers[record.crd_number] = (crdNumbers[record.crd_number] || 0) + 1;
      });

      offset += 1000;
      
      if (offset >= totalCount) {
        hasMore = false;
      }
    }

    const duplicates = Object.entries(crdNumbers).filter(([crd, count]) => count > 1);
    
    if (duplicates.length > 0) {
      console.log(`❌ Found ${duplicates.length} duplicate crd_numbers:`);
      duplicates.slice(0, 5).forEach(([crd, count]) => {
        console.log(`   CRD ${crd}: ${count} records`);
      });
      
      if (duplicates.length > 5) {
        console.log(`   ... and ${duplicates.length - 5} more`);
      }
    } else {
      console.log('✅ No duplicate crd_numbers found');
    }

    // Check the RIA profiles count to see how many narratives we should have
    const { count: profileCount } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📋 Comparison:`);
    console.log(`   RIA profiles: ${profileCount}`);
    console.log(`   Narratives: ${totalCount}`);
    console.log(`   Missing narratives: ${profileCount - totalCount}`);

    if (profileCount - totalCount > 0) {
      console.log(`\n🎯 Pipeline needs to generate ${profileCount - totalCount} new narratives`);
    }

  } catch (err) {
    console.error('💥 Analysis failed:', err.message);
  }
  
  console.log('='.repeat(50));
  console.log('🏁 Table structure analysis complete');
}

analyzeNarrativesTable();
