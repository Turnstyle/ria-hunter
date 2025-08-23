require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Function to get RIAs without narratives
async function identifyMissingNarratives() {
  console.log('🔍 Identifying RIAs without narratives...');
  
  try {
    // Get all RIAs
    console.log('Fetching all RIA profiles...');
    const { data: allRias, error: riasError } = await supabase
      .from('ria_profiles')
      .select('crd_number');
    
    if (riasError) throw riasError;
    console.log(`Found ${allRias.length} total RIA profiles`);
    
    // Get RIAs with narratives
    console.log('Fetching RIAs with narratives...');
    const { data: existingNarratives, error: narrativesError } = await supabase
      .from('narratives')
      .select('crd_number')
      .not('crd_number', 'is', null);
   
    if (narrativesError) throw narrativesError;
    console.log(`Found ${existingNarratives.length} RIAs with existing narratives`);
    
    // Convert to Sets for easier comparison
    const allCRDs = new Set(allRias.map(ria => ria.crd_number));
    const existingCRDs = new Set(existingNarratives.map(narrative => narrative.crd_number));
    
    // Find missing narratives
    const missingCRDs = [...allCRDs].filter(crd => !existingCRDs.has(crd));
    console.log(`Identified ${missingCRDs.length} RIAs without narratives (${(missingCRDs.length / allRias.length * 100).toFixed(1)}% missing)`);
    
    // Divide into batches for parallel processing
    const batchSize = 5000; // Adjust based on your needs
    const batchCount = Math.ceil(missingCRDs.length / batchSize);
    console.log(`Creating ${batchCount} batches of ${batchSize} CRDs each...`);
    
    for (let i = 0; i < batchCount; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, missingCRDs.length);
      const batchCRDs = missingCRDs.slice(start, end);
      
      // Write batch file
      const batchFile = path.join(__dirname, `../missing_narratives_batch_${i+1}.json`);
      fs.writeFileSync(batchFile, JSON.stringify(batchCRDs));
      console.log(`Batch ${i+1}: Wrote ${batchCRDs.length} CRDs to ${batchFile}`);
    }
    
    // Also write full list for reference
    const fullListFile = path.join(__dirname, '../all_missing_narratives.json');
    fs.writeFileSync(fullListFile, JSON.stringify(missingCRDs));
    console.log(`Wrote full list of ${missingCRDs.length} missing narratives to ${fullListFile}`);
    
    return { 
      total: allRias.length,
      existing: existingNarratives.length,
      missing: missingCRDs.length,
      percentage: (missingCRDs.length / allRias.length * 100).toFixed(1)
    };
  } catch (error) {
    console.error('Error identifying missing narratives:', error);
    throw error;
  }
}

// Run the function if executed directly
if (require.main === module) {
  identifyMissingNarratives()
    .then(results => {
      console.log('\n📊 Missing Narratives Summary:');
      console.log(`Total RIAs: ${results.total}`);
      console.log(`RIAs with narratives: ${results.existing} (${100 - results.percentage}%)`);
      console.log(`RIAs missing narratives: ${results.missing} (${results.percentage}%)`);
      console.log('\nUse the targeted_narrative_generator.js with the --batch=N parameter to process each batch.');
      console.log('Example: node scripts/targeted_narrative_generator.js --batch=1');
    })
    .catch(error => {
      console.error('Failed to identify missing narratives:', error);
      process.exit(1);
    });
} else {
  module.exports = { identifyMissingNarratives };
}