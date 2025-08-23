const { createClient } = require('@supabase/supabase-js');
const { validateEnvVars } = require('./load-env');

async function findMissing() {
  const { supabaseUrl, supabaseServiceKey } = validateEnvVars();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('🔍 FINDING ACTUAL MISSING NARRATIVES');
  
  // Get a random sample of profiles from different ranges
  const ranges = [
    [0, 50],      // First 50
    [1000, 1050], // Middle range
    [50000, 50050], // Later range
    [100000, 100050] // End range
  ];
  
  for (const [start, end] of ranges) {
    console.log(`\n📊 Checking profiles ${start}-${end}:`);
    
    const { data: sampleProfiles } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name')
      .not('legal_name', 'is', null)
      .range(start, end);
    
    if (!sampleProfiles?.length) {
      console.log(`   ⚠️ No profiles found in range ${start}-${end}`);
      continue;
    }
    
    console.log(`   📝 Found ${sampleProfiles.length} profiles`);
    
    // Check which ones have narratives
    const crds = sampleProfiles.map(p => p.crd_number);
    const { data: existingNarratives } = await supabase
      .from('narratives')
      .select('crd_number')
      .in('crd_number', crds);
    
    const existingSet = new Set(existingNarratives?.map(n => n.crd_number) || []);
    const missing = sampleProfiles.filter(p => !existingSet.has(p.crd_number));
    
    console.log(`   ✅ Have narratives: ${existingNarratives?.length || 0}`);
    console.log(`   ❌ Missing narratives: ${missing.length}`);
    
    if (missing.length > 0) {
      console.log(`   🎯 First 3 missing:`);
      missing.slice(0, 3).forEach((p, i) => {
        console.log(`      ${i+1}. CRD: ${p.crd_number} - ${p.legal_name}`);
      });
      
      // If we found missing ones, test ETL on just one
      if (missing.length > 0) {
        console.log(`\n🧪 Testing ETL on missing profile: ${missing[0].legal_name} (CRD: ${missing[0].crd_number})`);
        break;
      }
    }
  }
}

findMissing().catch(console.error);
