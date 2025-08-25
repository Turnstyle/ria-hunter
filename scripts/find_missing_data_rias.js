const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findRiasWithMissingData() {
  console.log('🔍 Finding RIAs with missing data...');
  
  try {
    // Get all RIAs
    console.log('Fetching all RIA profiles...');
    const { data: allRias, error: riasError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name');
    
    if (riasError) throw riasError;
    console.log(`Found ${allRias.length} total RIA profiles`);
    
    // Get RIAs with control persons
    console.log('Fetching RIAs with control persons...');
    const { data: riasWithControlPersons, error: cpError } = await supabase
      .from('control_persons')
      .select('crd_number')
      .not('crd_number', 'is', null);
    
    if (cpError) throw cpError;
    
    // Get unique CRD numbers for RIAs with control persons
    const crdWithControlPersons = new Set(riasWithControlPersons.map(item => item.crd_number));
    console.log(`Found ${crdWithControlPersons.size} RIAs with control persons`);
    
    // Get RIAs with private funds
    console.log('Fetching RIAs with private funds...');
    const { data: riasWithPrivateFunds, error: pfError } = await supabase
      .from('ria_private_funds')
      .select('crd_number')
      .not('crd_number', 'is', null);
    
    if (pfError) throw pfError;
    
    // Get unique CRD numbers for RIAs with private funds
    const crdWithPrivateFunds = new Set(riasWithPrivateFunds.map(item => item.crd_number));
    console.log(`Found ${crdWithPrivateFunds.size} RIAs with private funds`);
    
    // Get RIAs with narratives
    console.log('Fetching RIAs with narratives...');
    const { data: riasWithNarratives, error: narrError } = await supabase
      .from('narratives')
      .select('crd_number')
      .not('crd_number', 'is', null);
    
    if (narrError) throw narrError;
    
    // Get unique CRD numbers for RIAs with narratives
    const crdWithNarratives = new Set(riasWithNarratives.map(item => item.crd_number));
    console.log(`Found ${crdWithNarratives.size} RIAs with narratives`);
    
    // Find RIAs missing control persons
    const riasMissingControlPersons = allRias.filter(ria => !crdWithControlPersons.has(ria.crd_number));
    console.log(`Found ${riasMissingControlPersons.length} RIAs missing control persons`);
    
    // Find RIAs missing private funds
    const riasMissingPrivateFunds = allRias.filter(ria => !crdWithPrivateFunds.has(ria.crd_number));
    console.log(`Found ${riasMissingPrivateFunds.length} RIAs missing private funds`);
    
    // Find RIAs missing narratives
    const riasMissingNarratives = allRias.filter(ria => !crdWithNarratives.has(ria.crd_number));
    console.log(`Found ${riasMissingNarratives.length} RIAs missing narratives`);
    
    // Sample of RIAs missing control persons
    console.log('\nSample RIAs missing control persons:');
    console.log(riasMissingControlPersons.slice(0, 10).map(ria => `${ria.crd_number}: ${ria.legal_name || 'Unknown'}`));
    
    // Sample of RIAs missing private funds
    console.log('\nSample RIAs missing private funds:');
    console.log(riasMissingPrivateFunds.slice(0, 10).map(ria => `${ria.crd_number}: ${ria.legal_name || 'Unknown'}`));
    
    // Save CRD numbers to files for processing
    const fs = require('fs');
    
    // Save CRDs missing control persons
    fs.writeFileSync(
      'missing_control_persons_crds.json',
      JSON.stringify(riasMissingControlPersons.map(ria => ria.crd_number), null, 2)
    );
    
    // Save CRDs missing private funds
    fs.writeFileSync(
      'missing_private_funds_crds.json',
      JSON.stringify(riasMissingPrivateFunds.map(ria => ria.crd_number), null, 2)
    );
    
    // Create batches for control persons and private funds
    const batchSize = 100;
    const cpBatches = [];
    const pfBatches = [];
    
    for (let i = 0; i < riasMissingControlPersons.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = riasMissingControlPersons.slice(i, i + batchSize).map(ria => ria.crd_number);
      cpBatches.push({ batch: batchNumber, crds: batch });
      
      fs.writeFileSync(
        `missing_control_persons_batch_${batchNumber}.json`,
        JSON.stringify(batch, null, 2)
      );
    }
    
    for (let i = 0; i < riasMissingPrivateFunds.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = riasMissingPrivateFunds.slice(i, i + batchSize).map(ria => ria.crd_number);
      pfBatches.push({ batch: batchNumber, crds: batch });
      
      fs.writeFileSync(
        `missing_private_funds_batch_${batchNumber}.json`,
        JSON.stringify(batch, null, 2)
      );
    }
    
    console.log(`\nCreated ${cpBatches.length} batches for control persons processing`);
    console.log(`Created ${pfBatches.length} batches for private funds processing`);
    
    console.log('\n✅ Next steps:');
    console.log('1. Process control persons with:');
    console.log('   node scripts/document_ai_control_persons.js --crds-file missing_control_persons_batch_1.json');
    console.log('2. Process private funds with:');
    console.log('   node scripts/document_ai_private_funds.js --crds-file missing_private_funds_batch_1.json');
    
  } catch (error) {
    console.error('Error finding RIAs with missing data:', error);
    process.exit(1);
  }
}

findRiasWithMissingData()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
