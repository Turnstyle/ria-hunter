// Simple data quality verification script for RIA Hunter
// Focuses on identifying duplicates and checking data distribution

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('RIA Hunter Data Quality Verification');
console.log('===================================');

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment variables:');
console.log(`SUPABASE_URL: ${supabaseUrl ? '✓ Present' : '✗ Missing'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✓ Present' : '✗ Missing'}`);

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing required environment variables');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Check specific table data quality
async function checkTableQuality(tableName, keyFields, sampleSize = 5) {
  console.log(`\n\n${tableName.toUpperCase()} QUALITY CHECK`);
  console.log('='.repeat(tableName.length + 13));
  
  try {
    // Get count
    console.log(`Getting count for ${tableName}...`);
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.log(`Error getting count: ${countError.message}`);
    } else {
      console.log(`Total records: ${count}`);
    }
    
    // Get sample
    console.log(`\nSample ${tableName} records:`);
    const { data: samples, error: sampleError } = await supabase
      .from(tableName)
      .select('*')
      .limit(sampleSize);
    
    if (sampleError) {
      console.log(`Error getting samples: ${sampleError.message}`);
      return;
    }
    
    if (!samples || samples.length === 0) {
      console.log('No sample records found');
      return;
    }
    
    // Display first sample
    console.log('First sample record:');
    console.log(JSON.stringify(samples[0], null, 2));
    
    // Check for data quality issues
    let hasKeyFieldIssues = false;
    const recordsWithMissingKeys = samples.filter(record => {
      return keyFields.some(field => !record[field]);
    });
    
    if (recordsWithMissingKeys.length > 0) {
      console.log(`\n⚠️ Warning: ${recordsWithMissingKeys.length}/${samples.length} sampled records have missing key fields`);
      hasKeyFieldIssues = true;
    } else {
      console.log(`\n✓ All sampled records have required key fields`);
    }
    
    // Check for unique values
    if (tableName === 'control_persons') {
      // For control persons, check unique RIAs
      console.log('\nChecking RIA distribution...');
      const { data: distinctRias, error: riasError } = await supabase
        .from(tableName)
        .select('ria_id')
        .limit(1000);
      
      if (riasError) {
        console.log(`Error getting distinct RIAs: ${riasError.message}`);
      } else if (distinctRias) {
        const uniqueRias = new Set(distinctRias.map(r => r.ria_id)).size;
        console.log(`Unique RIAs in sample (max 1000): ${uniqueRias}`);
        
        if (uniqueRias < 100) {
          console.log('⚠️ Warning: Very few unique RIAs - potential duplication issue');
        } else {
          console.log('✓ Good distribution across RIAs');
        }
      }
      
      // Check for records with the same RIA and person name
      console.log('\nChecking for potential duplicates...');
      if (samples.length > 0) {
        const { data: duplicates, error: dupError } = await supabase
          .from(tableName)
          .select('ria_id, person_name, count')
          .eq('ria_id', samples[0].ria_id)
          .eq('person_name', samples[0].person_name)
          .limit(10);
        
        if (dupError) {
          console.log(`Error checking duplicates: ${dupError.message}`);
        } else if (duplicates && duplicates.length > 1) {
          console.log(`⚠️ Found ${duplicates.length} potential duplicates for ria_id=${samples[0].ria_id}, person_name=${samples[0].person_name}`);
        } else {
          console.log('✓ No immediate duplication issues detected in sample');
        }
      }
    } 
    else if (tableName === 'ria_private_funds') {
      // For private funds, check unique RIAs
      console.log('\nChecking RIA distribution...');
      const { data: distinctRias, error: riasError } = await supabase
        .from(tableName)
        .select('ria_id')
        .limit(1000);
      
      if (riasError) {
        console.log(`Error getting distinct RIAs: ${riasError.message}`);
      } else if (distinctRias) {
        const uniqueRias = new Set(distinctRias.map(r => r.ria_id)).size;
        console.log(`Unique RIAs in sample (max 1000): ${uniqueRias}`);
        
        if (uniqueRias < 100) {
          console.log('⚠️ Warning: Very few unique RIAs - potential duplication issue');
        } else {
          console.log('✓ Good distribution across RIAs');
        }
      }
      
      // Check for records with the same RIA and fund name
      console.log('\nChecking for potential duplicates...');
      if (samples.length > 0) {
        const { data: duplicates, error: dupError } = await supabase
          .from(tableName)
          .select('ria_id, fund_name, count')
          .eq('ria_id', samples[0].ria_id)
          .eq('fund_name', samples[0].fund_name)
          .limit(10);
        
        if (dupError) {
          console.log(`Error checking duplicates: ${dupError.message}`);
        } else if (duplicates && duplicates.length > 1) {
          console.log(`⚠️ Found ${duplicates.length} potential duplicates for ria_id=${samples[0].ria_id}, fund_name=${samples[0].fund_name}`);
        } else {
          console.log('✓ No immediate duplication issues detected in sample');
        }
      }
    }
    
    // Spot check across different CRD ranges
    console.log('\nSpot checking across different CRD ranges...');
    const ranges = [
      { min: 1, max: 1000 },
      { min: 50000, max: 51000 },
      { min: 100000, max: 101000 }
    ];
    
    for (const range of ranges) {
      const { data: rangeRecords, error: rangeError } = await supabase
        .from(tableName)
        .select('*')
        .gte('ria_id', range.min)
        .lte('ria_id', range.max)
        .limit(2);
      
      if (rangeError) {
        console.log(`Error checking range ${range.min}-${range.max}: ${rangeError.message}`);
      } else {
        console.log(`Range ${range.min}-${range.max}: ${rangeRecords.length > 0 ? `${rangeRecords.length} records found` : 'No records'}`);
      }
    }
    
    // Overall data quality assessment
    console.log('\nOverall Data Quality Assessment:');
    if (hasKeyFieldIssues) {
      console.log('⚠️ WARNING: Some key fields missing in records');
    } else {
      console.log('✓ Key fields present in sampled records');
    }
    
  } catch (err) {
    console.error(`Error analyzing ${tableName}:`, err.message);
  }
}

async function runChecks() {
  try {
    await checkTableQuality('control_persons', ['ria_id', 'person_name']);
    await checkTableQuality('ria_private_funds', ['ria_id', 'fund_name']);
    
    console.log('\n\nData Quality Verification Complete');
    console.log('=================================');
    console.log('Checked control_persons and ria_private_funds tables');
    console.log('Completed at:', new Date().toISOString());
  } catch (err) {
    console.error('Error during verification:', err.message);
  }
}

runChecks();
