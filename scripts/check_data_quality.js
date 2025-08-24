// Data quality check script for RIA Hunter
// Checks for data quality issues in control_persons and ria_private_funds tables
// Looks for duplicates and performs spot checks across the dataset

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in environment variables');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDataQuality() {
  console.log('RIA HUNTER DATA QUALITY ANALYSIS');
  console.log('================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('\n');

  try {
    // Get total counts
    const { data: riasCount } = await supabase.from('ria_profiles').select('*', { count: 'exact', head: true });
    const { data: narrativesCount } = await supabase.from('narratives').select('*', { count: 'exact', head: true });
    const { data: controlPersonsCount } = await supabase.from('control_persons').select('*', { count: 'exact', head: true });
    const { data: privateFundsCount } = await supabase.from('ria_private_funds').select('*', { count: 'exact', head: true });

    console.log('RECORD COUNTS:');
    console.log(`RIA Profiles: ${riasCount || 'Error retrieving count'}`);
    console.log(`Narratives: ${narrativesCount || 'Error retrieving count'}`);
    console.log(`Control Persons: ${controlPersonsCount || 'Error retrieving count'}`);
    console.log(`Private Funds: ${privateFundsCount || 'Error retrieving count'}`);
    console.log('\n');

    // === CONTROL PERSONS ANALYSIS ===
    console.log('CONTROL PERSONS ANALYSIS:');
    
    // Check for duplicate control persons (by ria_id + person_name combination)
    const { data: controlPersonsSample, error: sampleError } = await supabase
      .from('control_persons')
      .select('*')
      .limit(5);
    
    if (sampleError) {
      console.log('Error retrieving control persons sample:', sampleError.message);
    } else if (controlPersonsSample.length > 0) {
      console.log('Sample control person record:');
      console.log(JSON.stringify(controlPersonsSample[0], null, 2));
      
      // Check primary key fields
      const primaryKeyFields = controlPersonsSample[0].control_person_pk ? ['control_person_pk'] : ['ria_id', 'person_name'];
      console.log(`Primary key fields: ${primaryKeyFields.join(', ')}`);
      
      // Check for empty or null values in critical fields
      const criticalFields = ['ria_id', 'person_name', 'title'];
      const emptyFieldsSample = controlPersonsSample.filter(record => 
        criticalFields.some(field => !record[field] || record[field].trim() === '')
      );
      
      console.log(`Records with empty critical fields in sample: ${emptyFieldsSample.length} / ${controlPersonsSample.length}`);
      
      // Spot check from different CRD ranges
      const ranges = [
        { min: 1, max: 1000 },
        { min: 50000, max: 51000 },
        { min: 100000, max: 101000 }
      ];
      
      console.log('\nSpot checks across different CRD ranges:');
      for (const range of ranges) {
        const { data: rangeCheck } = await supabase
          .from('control_persons')
          .select('*')
          .gte('ria_id', range.min)
          .lte('ria_id', range.max)
          .limit(1);
          
        console.log(`Range ${range.min}-${range.max}: ${rangeCheck.length > 0 ? 'Records found' : 'No records'}`);
        if (rangeCheck.length > 0) {
          console.log(`  Sample ria_id: ${rangeCheck[0].ria_id}, person_name: ${rangeCheck[0].person_name}`);
        }
      }
      
      // Check for records with very similar data
      const { data: duplicateCandidates } = await supabase
        .from('control_persons')
        .select('ria_id, person_name, COUNT(*)')
        .eq('ria_id', controlPersonsSample[0].ria_id)
        .eq('person_name', controlPersonsSample[0].person_name)
        .limit(10);
        
      console.log(`\nPossible duplicates for ria_id=${controlPersonsSample[0].ria_id}, person_name=${controlPersonsSample[0].person_name}: ${duplicateCandidates.length}`);
    }

    // === PRIVATE FUNDS ANALYSIS ===
    console.log('\nPRIVATE FUNDS ANALYSIS:');
    
    // Check for duplicate private funds (by ria_id + fund_name combination)
    const { data: privateFundsSample, error: fundSampleError } = await supabase
      .from('ria_private_funds')
      .select('*')
      .limit(5);
    
    if (fundSampleError) {
      console.log('Error retrieving private funds sample:', fundSampleError.message);
    } else if (privateFundsSample.length > 0) {
      console.log('Sample private fund record:');
      console.log(JSON.stringify(privateFundsSample[0], null, 2));
      
      // Check primary key fields
      const primaryKeyFields = privateFundsSample[0].id ? ['id'] : ['ria_id', 'fund_name'];
      console.log(`Primary key fields: ${primaryKeyFields.join(', ')}`);
      
      // Check for empty or null values in critical fields
      const criticalFields = ['ria_id', 'fund_name', 'fund_type'];
      const emptyFieldsSample = privateFundsSample.filter(record => 
        criticalFields.some(field => !record[field] || (typeof record[field] === 'string' && record[field].trim() === ''))
      );
      
      console.log(`Records with empty critical fields in sample: ${emptyFieldsSample.length} / ${privateFundsSample.length}`);
      
      // Spot check from different CRD ranges
      const ranges = [
        { min: 1, max: 1000 },
        { min: 50000, max: 51000 },
        { min: 100000, max: 101000 }
      ];
      
      console.log('\nSpot checks across different CRD ranges:');
      for (const range of ranges) {
        const { data: rangeCheck } = await supabase
          .from('ria_private_funds')
          .select('*')
          .gte('ria_id', range.min)
          .lte('ria_id', range.max)
          .limit(1);
          
        console.log(`Range ${range.min}-${range.max}: ${rangeCheck.length > 0 ? 'Records found' : 'No records'}`);
        if (rangeCheck.length > 0) {
          console.log(`  Sample ria_id: ${rangeCheck[0].ria_id}, fund_name: ${rangeCheck[0].fund_name}`);
        }
      }
      
      // Check for records with very similar data
      const { data: duplicateCandidates } = await supabase
        .from('ria_private_funds')
        .select('ria_id, fund_name, COUNT(*)')
        .eq('ria_id', privateFundsSample[0].ria_id)
        .eq('fund_name', privateFundsSample[0].fund_name)
        .limit(10);
        
      console.log(`\nPossible duplicates for ria_id=${privateFundsSample[0].ria_id}, fund_name=${privateFundsSample[0].fund_name}: ${duplicateCandidates.length}`);
    }

    // === UNIQUE ENTITIES ANALYSIS ===
    console.log('\nUNIQUE ENTITIES ANALYSIS:');
    
    const { data: uniqueRIAsWithControlPersons } = await supabase
      .from('control_persons')
      .select('ria_id')
      .limit(1000);
      
    const { data: uniqueRIAsWithPrivateFunds } = await supabase
      .from('ria_private_funds')
      .select('ria_id')
      .limit(1000);
      
    const uniqueControlPersonsRIAs = new Set(uniqueRIAsWithControlPersons?.map(r => r.ria_id) || []);
    const uniquePrivateFundsRIAs = new Set(uniqueRIAsWithPrivateFunds?.map(r => r.ria_id) || []);
    
    console.log(`Unique RIAs with control persons (sample): ${uniqueControlPersonsRIAs.size}`);
    console.log(`Unique RIAs with private funds (sample): ${uniquePrivateFundsRIAs.size}`);
    
    console.log('\nDATA QUALITY VERDICT:');
    if (uniqueControlPersonsRIAs.size < 100) {
      console.log('⚠️ CONTROL PERSONS: Potentially problematic - very few unique RIAs');
    } else {
      console.log('✅ CONTROL PERSONS: Appears to have good distribution across RIAs');
    }
    
    if (uniquePrivateFundsRIAs.size < 100) {
      console.log('⚠️ PRIVATE FUNDS: Potentially problematic - very few unique RIAs');
    } else {
      console.log('✅ PRIVATE FUNDS: Appears to have good distribution across RIAs');
    }
    
  } catch (error) {
    console.error('Error in data quality analysis:', error.message);
  }
  
  console.log('\nAnalysis completed at:', new Date().toISOString());
}

checkDataQuality();
