#!/usr/bin/env npx tsx

// Check what profile IDs actually exist in the database
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkWorkingProfileIds() {
  console.log('🔍 Checking what profile IDs actually exist in database...\n');

  try {
    // Check total count
    const { count: totalCount, error: countError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error checking ria_profiles count:', countError);
      return;
    }

    console.log(`📊 Total profiles in database: ${totalCount}`);

    // Get a sample of actual profile IDs (check if cik column exists)
    let profiles: any[] = [];
    let profilesError: any = null;
    
    // Try with cik column first
    const { data: cikProfiles, error: cikError } = await supabase
      .from('ria_profiles')
      .select('crd_number, cik, legal_name, city, state, aum')
      .not('crd_number', 'is', null)
      .order('aum', { ascending: false })
      .limit(10);
    
    if (cikError && cikError.code === '42703') {
      console.log('⚠️ CIK column does not exist - using CRD numbers only\n');
      // Fallback without cik column
      const { data: crdProfiles, error: crdError } = await supabase
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state, aum')
        .not('crd_number', 'is', null)
        .order('aum', { ascending: false })
        .limit(10);
      
      profiles = crdProfiles || [];
      profilesError = crdError;
    } else {
      profiles = cikProfiles || [];
      profilesError = cikError;
    }

    if (profilesError) {
      console.error('❌ Error fetching profile samples:', profilesError);
      return;
    }

    console.log('\n🎯 TOP 10 PROFILE IDs BY AUM (These should work):');
    console.log('=' .repeat(80));
    
    if (profiles && profiles.length > 0) {
      profiles.forEach((profile, index) => {
        const primaryId = profile.cik || profile.crd_number;
        console.log(`${index + 1}. ID: ${primaryId} (CRD: ${profile.crd_number}, CIK: ${profile.cik || 'null'})`);
        console.log(`   Name: ${profile.legal_name}`);
        console.log(`   Location: ${profile.city}, ${profile.state}`);
        console.log(`   AUM: $${profile.aum ? (profile.aum / 1000000).toFixed(1) + 'M' : 'N/A'}`);
        console.log(`   API URL: /api/v1/ria/profile/${primaryId}`);
        console.log('');
      });
    }

    // Test some specific IDs that frontend is trying
    console.log('🧪 TESTING SPECIFIC IDs that frontend is trying...\n');
    const testIds = ['29880', '51', '423', '162262', '1331'];
    
    for (const testId of testIds) {
      let testProfile: any = null;
      let testError: any = null;
      
      // Try CIK/CRD query if cik column exists
      if (cikError?.code !== '42703') {
        const result = await supabase
          .from('ria_profiles')
          .select('crd_number, cik, legal_name')
          .or(`cik.eq.${testId},crd_number.eq.${testId}`)
          .single();
        testProfile = result.data;
        testError = result.error;
      } else {
        // Only test CRD if cik column doesn't exist
        const result = await supabase
          .from('ria_profiles')
          .select('crd_number, legal_name')
          .eq('crd_number', testId)
          .single();
        testProfile = result.data;
        testError = result.error;
      }

      if (testProfile) {
        console.log(`✅ ID ${testId}: Found - ${testProfile.legal_name} (CRD: ${testProfile.crd_number}, CIK: ${testProfile.cik || 'N/A'})`);
      } else {
        console.log(`❌ ID ${testId}: NOT FOUND in database`);
      }
    }

    // Check CIK coverage only if cik column exists
    if (cikError?.code !== '42703') {
      const { count: cikCount, error: cikCountError } = await supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
        .not('cik', 'is', null);

      if (!cikCountError) {
        console.log(`\n📈 Profiles with CIK numbers: ${cikCount}/${totalCount} (${((cikCount / totalCount) * 100).toFixed(1)}%)`);
      }
    } else {
      console.log(`\n📈 CIK column does not exist - all lookups use CRD numbers only`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkWorkingProfileIds();
