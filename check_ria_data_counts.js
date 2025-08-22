const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDataCounts() {
  console.log('🔍 Checking RIA data counts and potential issues...\n');

  // Check ria_profiles count by different criteria
  const { count: totalProfiles } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true });
  console.log(`📋 Total RIA profiles: ${totalProfiles}`);

  // Check for potential duplicates by CRD number
  const { data: duplicates } = await supabase
    .from('ria_profiles')
    .select('crd_number, count(*)', { count: 'exact' })
    .group('crd_number')
    .having('count(*)', 'gt', 1);
  
  if (duplicates && duplicates.length > 0) {
    console.log(`🔄 Duplicate CRD numbers found: ${duplicates.length}`);
  } else {
    console.log('✅ No duplicates found by CRD number');
  }

  // Check states distribution
  const { data: stateData } = await supabase
    .from('ria_profiles')
    .select('state, count(*)')
    .group('state')
    .order('count', { ascending: false })
    .limit(10);

  console.log('\n📍 Top 10 states by RIA count:');
  if (stateData) {
    stateData.forEach(row => {
      console.log(`  ${row.state || 'NULL'}: ${row.count}`);
    });
  }

  // Check AUM distribution
  const { data: aumData } = await supabase
    .from('ria_profiles')
    .select('aum')
    .not('aum', 'is', null)
    .order('aum', { ascending: false })
    .limit(1);

  if (aumData && aumData.length > 0) {
    console.log(`\n💰 Largest AUM: $${aumData[0].aum?.toLocaleString()}`);
  }

  // Check if there are any filters or constraints
  const { count: withAUM } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
    .not('aum', 'is', null);
    
  const { count: withoutAUM } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
    .is('aum', null);

  console.log(`\n📊 Profiles with AUM: ${withAUM}`);
  console.log(`📊 Profiles without AUM: ${withoutAUM}`);

  // Check date range
  const { data: dateRange } = await supabase
    .from('ria_profiles')
    .select('form_adv_date')
    .not('form_adv_date', 'is', null)
    .order('form_adv_date', { ascending: false })
    .limit(1);

  if (dateRange && dateRange.length > 0) {
    console.log(`\n📅 Most recent form_adv_date: ${dateRange[0].form_adv_date}`);
  }

  console.log(`\n🤔 ANALYSIS:`);
  console.log(`• Current count: ${totalProfiles}`);
  console.log(`• Expected: ~200,000`);
  console.log(`• Difference: ${200000 - totalProfiles} profiles missing`);
  
  if (totalProfiles < 150000) {
    console.log(`⚠️  Significantly fewer profiles than expected!`);
    console.log(`   Possible causes:`);
    console.log(`   - Data filtering during ETL`);
    console.log(`   - Incomplete data load`);
    console.log(`   - Deduplication removed many records`);
    console.log(`   - Source data changed`);
  }
}

checkDataCounts();
