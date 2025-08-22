// Script to audit missing fields in ria_profiles
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function auditMissingFields() {
  try {
    console.log('Auditing missing fields in ria_profiles...');
    
    // Get column names from a sample row
    const { data: sampleData, error: sampleError } = await supabase
      .from('ria_profiles')
      .select('*')
      .limit(1);
      
    if (sampleError) {
      console.error('Error fetching sample data:', sampleError);
      return;
    }
    
    if (!sampleData || sampleData.length === 0) {
      console.log('No sample data found');
      return;
    }
    
    // Extract column names
    const columns = Object.keys(sampleData[0]);
    console.log(`Found ${columns.length} columns in ria_profiles table`);
    
    // Key fields to check
    const keyFields = [
      'legal_name',
      'city',
      'state',
      'aum',
      'phone',
      'website',
      'fax',
      'cik',
      'form_adv_date'
    ];
    
    // Get total count for percentage calculation
    const { count: totalCount, error: countError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      console.error('Error counting profiles:', countError);
      return;
    }
    
    console.log(`\nTotal profiles: ${totalCount}`);
    console.log('\nMissing field counts:');
    
    // Check each key field
    for (const field of keyFields) {
      if (!columns.includes(field)) {
        console.log(`- ${field}: Column does not exist`);
        continue;
      }
      
      // Count NULL values
      const { count: nullCount, error: nullError } = await supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
        .is(field, null);
        
      if (nullError) {
        console.error(`Error counting null ${field}:`, nullError);
        continue;
      }
      
      // Count empty string values (for text fields)
      let emptyCount = 0;
      
      if (typeof sampleData[0][field] === 'string' || sampleData[0][field] === null) {
        const { count: empCount, error: empError } = await supabase
          .from('ria_profiles')
          .select('*', { count: 'exact', head: true })
          .eq(field, '');
          
        if (!empError) {
          emptyCount = empCount;
        }
      }
      
      // Count zero values (for numeric fields)
      let zeroCount = 0;
      
      if (typeof sampleData[0][field] === 'number' || sampleData[0][field] === null) {
        const { count: zCount, error: zError } = await supabase
          .from('ria_profiles')
          .select('*', { count: 'exact', head: true })
          .eq(field, 0);
          
        if (!zError) {
          zeroCount = zCount;
        }
      }
      
      const totalMissing = nullCount + emptyCount + zeroCount;
      const percentMissing = ((totalMissing / totalCount) * 100).toFixed(2);
      
      console.log(`- ${field}: ${totalMissing} (${percentMissing}%) missing`);
      console.log(`  • NULL: ${nullCount}`);
      
      if (emptyCount > 0) {
        console.log(`  • Empty string: ${emptyCount}`);
      }
      
      if (zeroCount > 0) {
        console.log(`  • Zero: ${zeroCount}`);
      }
    }
    
    // Get a sample of complete vs incomplete profiles
    console.log('\nSample profiles with missing fields:');
    
    const { data: incompleteProfiles, error: incompleteError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, phone, website')
      .or(`legal_name.is.null,city.is.null,state.is.null,aum.is.null,phone.is.null,website.is.null`)
      .limit(3);
      
    if (incompleteError) {
      console.error('Error fetching incomplete profiles:', incompleteError);
    } else if (incompleteProfiles && incompleteProfiles.length > 0) {
      incompleteProfiles.forEach((profile, i) => {
        console.log(`\nIncomplete Profile ${i + 1} (CRD: ${profile.crd_number}):`);
        Object.entries(profile).forEach(([key, value]) => {
          console.log(`  ${key}: ${value === null ? 'NULL' : value}`);
        });
      });
    }
    
    console.log('\nSample profiles with all fields:');
    
    const { data: completeProfiles, error: completeError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, phone, website')
      .not('legal_name', 'is', null)
      .not('city', 'is', null)
      .not('state', 'is', null)
      .not('aum', 'is', null)
      .not('phone', 'is', null)
      .not('website', 'is', null)
      .limit(3);
      
    if (completeError) {
      console.error('Error fetching complete profiles:', completeError);
    } else if (completeProfiles && completeProfiles.length > 0) {
      completeProfiles.forEach((profile, i) => {
        console.log(`\nComplete Profile ${i + 1} (CRD: ${profile.crd_number}):`);
        Object.entries(profile).forEach(([key, value]) => {
          console.log(`  ${key}: ${value === null ? 'NULL' : value}`);
        });
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

auditMissingFields();
