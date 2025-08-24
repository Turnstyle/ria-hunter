// Final simplified data check script for RIA Hunter
// Focuses on CRD distribution and simple spot checks

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('RIA Hunter Final Data Quality Check');
console.log('==================================');
console.log(`Started at: ${new Date().toISOString()}`);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runDataChecks() {
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
    console.log(`RIA Profiles: ${riasCount || 'Error retrieving'} records`);
    console.log(`Narratives: ${narrativesCount || 'Error retrieving'} records`);
    console.log(`Control Persons: ${controlPersonsCount || 'Error retrieving'} records`);
    console.log(`Private Funds: ${privateFundsCount || 'Error retrieving'} records`);
    
    // Check CRD number distribution in control persons
    console.log('\n=== CONTROL PERSONS CRD DISTRIBUTION ===');
    const { data: controlPersonsCRDs, error: cpCRDsError } = await supabase
      .from('control_persons')
      .select('crd_number')
      .limit(1000);
      
    if (cpCRDsError) {
      console.log('Error retrieving control persons CRDs:', cpCRDsError.message);
    } else if (controlPersonsCRDs) {
      const uniqueCRDs = new Set(controlPersonsCRDs.map(cp => cp.crd_number));
      console.log(`Unique CRD numbers in sample (max 1000): ${uniqueCRDs.size} / ${controlPersonsCRDs.length}`);
      console.log(`Uniqueness ratio: ${(uniqueCRDs.size / controlPersonsCRDs.length * 100).toFixed(2)}%`);
      
      if (uniqueCRDs.size / controlPersonsCRDs.length < 0.1) {
        console.log('⚠️ WARNING: Very low uniqueness ratio - possible duplicate issue');
      } else {
        console.log('✅ Reasonable uniqueness ratio - data appears well-distributed');
      }
      
      // Sample some control persons by CRD
      console.log('\nSampling control persons from different CRD numbers:');
      const sampleCRDs = Array.from(uniqueCRDs).slice(0, 3);
      
      for (const crd of sampleCRDs) {
        const { data: crdSample, error: crdError } = await supabase
          .from('control_persons')
          .select('*')
          .eq('crd_number', crd)
          .limit(3);
          
        if (crdError) {
          console.log(`Error retrieving control persons for CRD ${crd}:`, crdError.message);
        } else if (crdSample) {
          console.log(`CRD ${crd}: ${crdSample.length} records found in sample`);
          if (crdSample.length > 0) {
            console.log(`  Sample person: ${crdSample[0].person_name}, Title: ${crdSample[0].title}`);
          }
        }
      }
    }
    
    // Check CRD number distribution in private funds
    console.log('\n=== PRIVATE FUNDS CRD DISTRIBUTION ===');
    const { data: privateFundsCRDs, error: pfCRDsError } = await supabase
      .from('ria_private_funds')
      .select('crd_number')
      .limit(1000);
      
    if (pfCRDsError) {
      console.log('Error retrieving private funds CRDs:', pfCRDsError.message);
    } else if (privateFundsCRDs) {
      const uniqueCRDs = new Set(privateFundsCRDs.map(pf => pf.crd_number));
      console.log(`Unique CRD numbers in sample (max 1000): ${uniqueCRDs.size} / ${privateFundsCRDs.length}`);
      console.log(`Uniqueness ratio: ${(uniqueCRDs.size / privateFundsCRDs.length * 100).toFixed(2)}%`);
      
      if (uniqueCRDs.size / privateFundsCRDs.length < 0.1) {
        console.log('⚠️ WARNING: Very low uniqueness ratio - possible duplicate issue');
      } else {
        console.log('✅ Reasonable uniqueness ratio - data appears well-distributed');
      }
      
      // Sample some private funds by CRD
      console.log('\nSampling private funds from different CRD numbers:');
      const sampleCRDs = Array.from(uniqueCRDs).slice(0, 3);
      
      for (const crd of sampleCRDs) {
        const { data: crdSample, error: crdError } = await supabase
          .from('ria_private_funds')
          .select('*')
          .eq('crd_number', crd)
          .limit(3);
          
        if (crdError) {
          console.log(`Error retrieving private funds for CRD ${crd}:`, crdError.message);
        } else if (crdSample) {
          console.log(`CRD ${crd}: ${crdSample.length} records found in sample`);
          if (crdSample.length > 0) {
            console.log(`  Sample fund: ${crdSample[0].fund_name}, Type: ${crdSample[0].fund_type}`);
          }
        }
      }
    }
    
    // Check for duplicate narratives
    console.log('\n=== NARRATIVES CHECK ===');
    const { data: narrativesSample, error: narError } = await supabase
      .from('narratives')
      .select('*')
      .limit(5);
      
    if (narError) {
      console.log('Error retrieving narratives sample:', narError.message);
    } else if (narrativesSample) {
      console.log(`Retrieved ${narrativesSample.length} narrative samples`);
      
      if (narrativesSample.length > 0) {
        console.log('First narrative sample:');
        console.log(`  CRD: ${narrativesSample[0].crd_number}`);
        console.log(`  Type: ${narrativesSample[0].narrative_type}`);
        console.log(`  Text: ${narrativesSample[0].narrative_text?.substring(0, 100)}...`);
        
        // Check if there are duplicates by CRD
        if (narrativesSample[0].crd_number) {
          const { data: crdNarratives, error: crdNarError } = await supabase
            .from('narratives')
            .select('*')
            .eq('crd_number', narrativesSample[0].crd_number)
            .limit(10);
            
          if (crdNarError) {
            console.log('Error checking for duplicate narratives:', crdNarError.message);
          } else if (crdNarratives) {
            console.log(`Found ${crdNarratives.length} narratives for CRD ${narrativesSample[0].crd_number}`);
            
            // Check for duplicates
            const narrativeTypes = crdNarratives.map(n => n.narrative_type);
            const uniqueTypes = new Set(narrativeTypes);
            
            if (uniqueTypes.size < narrativeTypes.length) {
              console.log('⚠️ WARNING: Multiple narratives of same type for a single CRD');
            } else {
              console.log('✅ No duplicate narrative types for this CRD');
            }
          }
        }
      }
    }
    
    console.log('\n=== DATA QUALITY ASSESSMENT ===');
    console.log(`Control Persons: ${controlPersonsCount} records for ${riasCount} RIAs (${(controlPersonsCount / riasCount).toFixed(2)} per RIA)`);
    console.log(`Private Funds: ${privateFundsCount} records for ${riasCount} RIAs (${(privateFundsCount / riasCount).toFixed(2)} per RIA)`);
    console.log(`Narratives: ${narrativesCount} records for ${riasCount} RIAs (${(narrativesCount / riasCount * 100).toFixed(2)}% coverage)`);
    
    console.log('\nData check completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('Error in data check:', error.message);
  }
}

runDataChecks();
