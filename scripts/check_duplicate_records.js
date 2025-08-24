// Final data quality verification script for RIA Hunter
// Correctly checks for duplicate records using the actual schema

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('RIA Hunter Duplicate Record Verification');
console.log('=======================================');
console.log(`Started at: ${new Date().toISOString()}`);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  try {
    // Get record counts
    console.log('\nGetting record counts...');
    
    const { count: riasCount, error: riasError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    const { count: narrativesCount, error: narrativesError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
      
    const { count: controlPersonsCount, error: controlPersonsError } = await supabase
      .from('control_persons')
      .select('*', { count: 'exact', head: true });
      
    const { count: privateFundsCount, error: privateFundsError } = await supabase
      .from('ria_private_funds')
      .select('*', { count: 'exact', head: true });
    
    console.log('Current record counts:');
    console.log(`RIA Profiles: ${riasCount || 'Error retrieving'}`);
    console.log(`Narratives: ${narrativesCount || 'Error retrieving'}`);
    console.log(`Control Persons: ${controlPersonsCount || 'Error retrieving'}`);
    console.log(`Private Funds: ${privateFundsCount || 'Error retrieving'}`);
    
    // Check for duplicate control persons
    console.log('\n=== CONTROL PERSONS ANALYSIS ===');
    
    // Get sample record
    const { data: controlPersonsSample, error: cpSampleError } = await supabase
      .from('control_persons')
      .select('*')
      .limit(1);
      
    if (cpSampleError) {
      console.log('Error retrieving control persons sample:', cpSampleError.message);
    } else if (controlPersonsSample?.length > 0) {
      console.log('Sample control person record:');
      console.log(JSON.stringify(controlPersonsSample[0], null, 2));
      
      // Check if crd_number exists and get unique values
      if (controlPersonsSample[0].crd_number) {
        const { data: uniqueCRDs, error: uniqueError } = await supabase
          .from('control_persons')
          .select('crd_number')
          .limit(1000);
          
        if (uniqueError) {
          console.log('Error getting unique CRDs:', uniqueError.message);
        } else if (uniqueCRDs) {
          const uniqueCRDsCount = new Set(uniqueCRDs.map(cp => cp.crd_number)).size;
          console.log(`Unique CRD numbers in sample (max 1000): ${uniqueCRDsCount}`);
          
          if (uniqueCRDsCount < 100 && uniqueCRDs.length > 500) {
            console.log('⚠️ WARNING: Few unique CRDs relative to sample size - possible duplication issue');
          } else {
            console.log('✅ Good distribution of CRD numbers');
          }
        }
        
        // Check for potential duplicates based on person_name per CRD
        const { data: duplicateCheck, error: dupError } = await supabase
          .from('control_persons')
          .select('crd_number, person_name, count(*)')
          .eq('crd_number', controlPersonsSample[0].crd_number)
          .eq('person_name', controlPersonsSample[0].person_name)
          .group('crd_number, person_name')
          .limit(5);
          
        if (dupError) {
          console.log('Error checking for duplicates:', dupError.message);
        } else if (duplicateCheck) {
          const highCounts = duplicateCheck.filter(d => d.count > 1);
          if (highCounts.length > 0) {
            console.log('⚠️ WARNING: Found potential duplicates:');
            console.log(highCounts);
          } else {
            console.log('✅ No obvious duplicates found in sample check');
          }
        }
      }
      
      // Spot check across CRD ranges
      console.log('\nSpot checks across different CRD ranges:');
      const ranges = [
        { min: 1, max: 10000 },
        { min: 50000, max: 60000 },
        { min: 100000, max: 110000 }
      ];
      
      for (const range of ranges) {
        const { data: rangeCheck, error: rangeError } = await supabase
          .from('control_persons')
          .select('crd_number, person_name, count(*)')
          .gte('crd_number', range.min)
          .lte('crd_number', range.max)
          .group('crd_number, person_name')
          .limit(5);
          
        if (rangeError) {
          console.log(`Error checking range ${range.min}-${range.max}:`, rangeError.message);
        } else if (rangeCheck) {
          console.log(`Range ${range.min}-${range.max}: ${rangeCheck.length} distinct records found`);
          
          // Check for duplicates in this range
          const potentialDuplicates = rangeCheck.filter(r => r.count > 1);
          if (potentialDuplicates.length > 0) {
            console.log(`  ⚠️ Found ${potentialDuplicates.length} potential duplicate sets in this range`);
          } else {
            console.log('  ✅ No obvious duplicates in this range');
          }
        }
      }
    }
    
    // Check for duplicate private funds
    console.log('\n=== PRIVATE FUNDS ANALYSIS ===');
    
    // Get sample record
    const { data: fundsSample, error: fundsSampleError } = await supabase
      .from('ria_private_funds')
      .select('*')
      .limit(1);
      
    if (fundsSampleError) {
      console.log('Error retrieving private funds sample:', fundsSampleError.message);
    } else if (fundsSample?.length > 0) {
      console.log('Sample private fund record:');
      console.log(JSON.stringify(fundsSample[0], null, 2));
      
      // Check if crd_number exists and get unique values
      if (fundsSample[0].crd_number) {
        const { data: uniqueCRDs, error: uniqueError } = await supabase
          .from('ria_private_funds')
          .select('crd_number')
          .limit(1000);
          
        if (uniqueError) {
          console.log('Error getting unique CRDs:', uniqueError.message);
        } else if (uniqueCRDs) {
          const uniqueCRDsCount = new Set(uniqueCRDs.map(f => f.crd_number)).size;
          console.log(`Unique CRD numbers in sample (max 1000): ${uniqueCRDsCount}`);
          
          if (uniqueCRDsCount < 100 && uniqueCRDs.length > 500) {
            console.log('⚠️ WARNING: Few unique CRDs relative to sample size - possible duplication issue');
          } else {
            console.log('✅ Good distribution of CRD numbers');
          }
        }
        
        // Check for potential duplicates based on fund_name per CRD
        const { data: duplicateCheck, error: dupError } = await supabase
          .from('ria_private_funds')
          .select('crd_number, fund_name, count(*)')
          .eq('crd_number', fundsSample[0].crd_number)
          .eq('fund_name', fundsSample[0].fund_name)
          .group('crd_number, fund_name')
          .limit(5);
          
        if (dupError) {
          console.log('Error checking for duplicates:', dupError.message);
        } else if (duplicateCheck) {
          const highCounts = duplicateCheck.filter(d => d.count > 1);
          if (highCounts.length > 0) {
            console.log('⚠️ WARNING: Found potential duplicates:');
            console.log(highCounts);
          } else {
            console.log('✅ No obvious duplicates found in sample check');
          }
        }
      }
      
      // Spot check across CRD ranges
      console.log('\nSpot checks across different CRD ranges:');
      const ranges = [
        { min: 1, max: 10000 },
        { min: 50000, max: 60000 },
        { min: 100000, max: 110000 }
      ];
      
      for (const range of ranges) {
        const { data: rangeCheck, error: rangeError } = await supabase
          .from('ria_private_funds')
          .select('crd_number, fund_name, count(*)')
          .gte('crd_number', range.min)
          .lte('crd_number', range.max)
          .group('crd_number, fund_name')
          .limit(5);
          
        if (rangeError) {
          console.log(`Error checking range ${range.min}-${range.max}:`, rangeError.message);
        } else if (rangeCheck) {
          console.log(`Range ${range.min}-${range.max}: ${rangeCheck.length} distinct records found`);
          
          // Check for duplicates in this range
          const potentialDuplicates = rangeCheck.filter(r => r.count > 1);
          if (potentialDuplicates.length > 0) {
            console.log(`  ⚠️ Found ${potentialDuplicates.length} potential duplicate sets in this range`);
          } else {
            console.log('  ✅ No obvious duplicates in this range');
          }
        }
      }
    }
    
    console.log('\nVerification completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('Error in verification process:', error.message);
  }
}

checkDuplicates();
