// Missouri RIA Narrative Generator - Narratives Only
// First step: Generate narratives for Missouri RIAs (without embeddings)
// This will be followed by a separate embedding generation step

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

if (!googleApiKey) {
  console.error('❌ Missing Google AI Studio API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(googleApiKey);

// Configuration
const BATCH_SIZE = 10;
const DELAY_BETWEEN_REQUESTS = 2000;
const MAX_RETRIES = 3;

// Setup logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${message}`);
};

// Get Missouri RIAs without narratives
async function getMissouriRIAsWithoutNarratives() {
  try {
    log('🔍 Finding Missouri RIAs without narratives...');
    
    const { data: missouriRIAs, error: riasError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, website, phone, fax')
      .eq('state', 'MO')
      .not('legal_name', 'ilike', 'Investment Adviser (CRD #%')
      .not('legal_name', 'is', null);
      
    if (riasError) throw riasError;
    
    log(`📊 Found ${missouriRIAs.length} total Missouri RIAs`);
    
    // Get Missouri RIAs that already have narratives
    const crdNumbers = missouriRIAs.map(r => r.crd_number);
    const { data: existingNarratives, error: narrativeError } = await supabase
      .from('narratives')
      .select('crd_number')
      .in('crd_number', crdNumbers);
      
    if (narrativeError) throw narrativeError;
    
    // Filter out those that already have narratives
    const existingCRDs = new Set(existingNarratives.map(n => n.crd_number));
    const riasWithoutNarratives = missouriRIAs.filter(ria => !existingCRDs.has(ria.crd_number));
    
    log(`✅ Found ${existingNarratives.length} Missouri RIAs with existing narratives`);
    log(`📝 Found ${riasWithoutNarratives.length} Missouri RIAs needing narratives`);
    
    return riasWithoutNarratives;
    
  } catch (error) {
    log(`❌ Error getting Missouri RIAs: ${error.message}`);
    throw error;
  }
}

// Generate narrative with Google AI
async function generateNarrative(riaProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
Generate a professional investment advisory narrative for "${riaProfile.legal_name}" (CRD #${riaProfile.crd_number}), a Missouri-based investment advisor.

Key Information:
- Location: ${riaProfile.city || 'Not provided'}, Missouri
- Assets Under Management: $${(riaProfile.aum || 0).toLocaleString()}
- Website: ${riaProfile.website || 'Not provided'}
- Phone: ${riaProfile.phone || 'Not provided'}

Context: This firm operates in Missouri's financial landscape, which includes major financial centers like St. Louis and Kansas City, as well as rural and suburban communities throughout the state.

Create a professional, factual 3-4 sentence narrative that:
1. Describes their likely advisory approach based on their location and size
2. Mentions their target client base (considering Missouri demographics)
3. Highlights any specializations or unique value propositions
4. Uses professional investment advisory language

Make it specific to Missouri and their market position.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (error) {
    log(`❌ Error generating narrative for CRD ${riaProfile.crd_number}: ${error.message}`);
    throw error;
  }
}

// Store narrative in database (without embedding for now)
async function storeNarrative(crdNumber, narrativeText) {
  try {
    const narrativeData = {
      crd_number: crdNumber,
      narrative: narrativeText
      // Note: embedding_vector will be null for now
    };
    
    const { data, error } = await supabase
      .from('narratives')
      .insert([narrativeData]);
      
    if (error) {
      log(`❌ Error storing narrative for CRD ${crdNumber}: ${error.message}`);
      return false;
    }
    
    return true;
  } catch (error) {
    log(`❌ Exception storing narrative for CRD ${crdNumber}: ${error.message}`);
    return false;
  }
}

// Process a single Missouri RIA
async function processMissouriRIA(ria, retryCount = 0) {
  try {
    log(`🏢 Processing: ${ria.legal_name} (CRD #${ria.crd_number}) - ${ria.city}, MO`);
    
    // Generate narrative
    const narrative = await generateNarrative(ria);
    log(`📝 Generated narrative: "${narrative.substring(0, 100)}..."`);
    
    // Store narrative
    const success = await storeNarrative(ria.crd_number, narrative);
    
    if (success) {
      log(`✅ Successfully processed CRD #${ria.crd_number} - ${ria.legal_name}`);
      return true;
    } else {
      throw new Error('Failed to store narrative');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`🔄 Retrying CRD #${ria.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      return processMissouriRIA(ria, retryCount + 1);
    } else {
      log(`❌ Failed to process CRD #${ria.crd_number} after ${MAX_RETRIES} attempts: ${error.message}`);
      return false;
    }
  }
}

// Main function
async function main() {
  log('🎯 Starting Missouri RIA Narrative Generation (Step 1 - Narratives Only)...');
  log('='.repeat(70));
  
  try {
    const missouriRIAs = await getMissouriRIAsWithoutNarratives();
    
    if (missouriRIAs.length === 0) {
      log('🎉 All Missouri RIAs already have narratives!');
      log('📝 Next: Run the embedding generation script to add embeddings');
      return;
    }
    
    log(`\n📋 Found ${missouriRIAs.length} Missouri RIAs that need narratives`);
    
    // Process all RIAs
    let totalSuccessful = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < missouriRIAs.length; i++) {
      const ria = missouriRIAs[i];
      const success = await processMissouriRIA(ria);
      
      if (success) {
        totalSuccessful++;
      } else {
        totalFailed++;
      }
      
      // Progress update
      log(`📊 Progress: ${i + 1}/${missouriRIAs.length} processed (${totalSuccessful} successful, ${totalFailed} failed)`);
      
      // Delay between requests to avoid rate limits
      if (i < missouriRIAs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }
    
    // Final summary
    log('\n🏁 Missouri RIA Narrative Generation Complete!');
    log('='.repeat(70));
    log(`📊 Final Results:`);
    log(`   ✅ Successful: ${totalSuccessful}`);
    log(`   ❌ Failed: ${totalFailed}`);
    log(`   📈 Success Rate: ${((totalSuccessful / (totalSuccessful + totalFailed)) * 100).toFixed(1)}%`);
    
    if (totalSuccessful > 0) {
      log(`\n🎉 SUCCESS! Created ${totalSuccessful} new Missouri RIA narratives!`);
      log('📝 Next step: Run the embedding generation script to add vector embeddings');
      log('   Command: node scripts/embed-missouri-narratives.js');
    } else {
      log('\n⚠️ No narratives were successfully created. Check the logs for issues.');
    }
    
  } catch (error) {
    log(`💥 Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n🛑 Received interrupt signal, shutting down gracefully...');
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    log(`💥 Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };
