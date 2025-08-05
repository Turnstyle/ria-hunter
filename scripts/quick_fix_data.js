#!/usr/bin/env node
/**
 * Quick Data Quality Fix for RIA Hunter
 * Fixes AUM units and duplicate CRD issues via Supabase API
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCurrentState() {
  console.log('🔍 Checking current data state...');
  
  // Check Edward Jones AUM
  const { data: edwardJones } = await supabase
    .from('ria_profiles')
    .select('legal_name, crd_number, aum')
    .ilike('legal_name', '%edward%jones%')
    .order('aum', { ascending: false })
    .limit(1);
  
  if (edwardJones && edwardJones.length > 0) {
    const aum = edwardJones[0].aum;
    console.log(`📊 Edward Jones current AUM: $${aum?.toLocaleString() || 'N/A'}`);
    return { needsAUMFix: aum && aum < 100_000_000 };
  }
  
  return { needsAUMFix: false };
}

async function fixAUMUnits() {
  console.log('💰 Fixing AUM units (multiplying by 1000)...');
  
  try {
    // Get all records with AUM > 0
    const { data: profiles } = await supabase
      .from('ria_profiles')
      .select('crd_number, aum')
      .gt('aum', 0);
    
    if (!profiles) {
      console.log('❌ No profiles found');
      return;
    }
    
    console.log(`🔧 Updating ${profiles.length} records...`);
    
    // Update in batches
    const batchSize = 100;
    let updated = 0;
    
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      
      for (const profile of batch) {
        const newAUM = profile.aum * 1000;
        await supabase
          .from('ria_profiles')
          .update({ aum: newAUM })
          .eq('crd_number', profile.crd_number);
        updated++;
      }
      
      console.log(`  - Updated ${Math.min(i + batchSize, profiles.length)}/${profiles.length} records`);
    }
    
    console.log(`✅ Updated AUM for ${updated} records`);
    
    // Verify Edward Jones
    const { data: edwardJones } = await supabase
      .from('ria_profiles')
      .select('legal_name, aum')
      .ilike('legal_name', '%edward%jones%')
      .order('aum', { ascending: false })
      .limit(1);
    
    if (edwardJones && edwardJones.length > 0) {
      console.log(`📊 Edward Jones new AUM: $${edwardJones[0].aum?.toLocaleString() || 'N/A'}`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing AUM units:', error.message);
  }
}

async function findDuplicates() {
  console.log('🔍 Finding duplicate firms...');
  
  const { data: profiles } = await supabase
    .from('ria_profiles')
    .select('legal_name, crd_number, aum')
    .not('legal_name', 'is', null)
    .order('legal_name');
  
  if (!profiles) return [];
  
  const firmMap = new Map();
  
  for (const profile of profiles) {
    const firmName = profile.legal_name.trim().toLowerCase();
    if (!firmMap.has(firmName)) {
      firmMap.set(firmName, []);
    }
    firmMap.get(firmName).push(profile);
  }
  
  const duplicates = [];
  for (const [firmName, records] of firmMap.entries()) {
    if (records.length > 1) {
      duplicates.push({ firmName, records });
    }
  }
  
  console.log(`📊 Found ${duplicates.length} firms with duplicates`);
  return duplicates;
}

async function fixDuplicates() {
  console.log('🔗 Fixing duplicate CRD numbers...');
  
  const duplicates = await findDuplicates();
  let removedCount = 0;
  
  for (const { firmName, records } of duplicates) {
    // Sort by AUM descending, keep the highest
    records.sort((a, b) => (b.aum || 0) - (a.aum || 0));
    const primary = records[0];
    const duplicatesToRemove = records.slice(1);
    
    console.log(`🔧 ${firmName}: keeping CRD ${primary.crd_number} (AUM: $${primary.aum?.toLocaleString() || '0'})`);
    
    for (const duplicate of duplicatesToRemove) {
      // Move narratives to primary CRD
      await supabase
        .from('narratives')
        .update({ crd_number: primary.crd_number })
        .eq('crd_number', duplicate.crd_number);
      
      // Delete duplicate profile
      await supabase
        .from('ria_profiles')
        .delete()
        .eq('crd_number', duplicate.crd_number);
      
      console.log(`  - Removed CRD ${duplicate.crd_number}`);
      removedCount++;
    }
  }
  
  console.log(`✅ Removed ${removedCount} duplicate records`);
}

async function verifyFixes() {
  console.log('📊 Verifying fixes...');
  
  // Check Edward Jones
  const { data: edwardJones } = await supabase
    .from('ria_profiles')
    .select('legal_name, crd_number, aum, city, state')
    .ilike('legal_name', '%edward%jones%')
    .order('aum', { ascending: false });
  
  console.log(`📊 Edward Jones records: ${edwardJones?.length || 0}`);
  if (edwardJones && edwardJones.length > 0) {
    console.log(`   - Top AUM: $${edwardJones[0].aum?.toLocaleString() || 'N/A'}`);
  }
  
  // Check top 5 RIAs
  const { data: topRIAs } = await supabase
    .from('ria_profiles')
    .select('legal_name, aum, city, state')
    .not('aum', 'is', null)
    .order('aum', { ascending: false })
    .limit(5);
  
  console.log('🏆 Top 5 RIAs by AUM:');
  topRIAs?.forEach((ria, i) => {
    console.log(`   ${i + 1}. ${ria.legal_name}: $${ria.aum?.toLocaleString() || 'N/A'}`);
  });
  
  // Check remaining duplicates
  const remainingDuplicates = await findDuplicates();
  console.log(`📊 Remaining duplicate firms: ${remainingDuplicates.length}`);
}

async function main() {
  console.log('🚀 Starting RIA Hunter Data Quality Fix...');
  
  try {
    const state = await checkCurrentState();
    
    if (state.needsAUMFix) {
      await fixAUMUnits();
    } else {
      console.log('✅ AUM values appear to be in correct units');
    }
    
    await fixDuplicates();
    await verifyFixes();
    
    console.log('🎉 Data quality fix completed!');
    
  } catch (error) {
    console.error('❌ Error during data quality fix:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}