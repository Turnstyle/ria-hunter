// Complete Narrative Generator - Fixed Version
// This script finds ALL RIAs without narratives and processes them efficiently
// Fixes the sequential search problem in final_narrative_generator.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

if (!googleApiKey) {
  console.error('Missing Google AI Studio API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(googleApiKey);

// Configuration
const BATCH_SIZE = 20; // Increased for better throughput
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'complete_narrative_generation.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'complete_narrative_progress.json');

// Create logs directory if it doesn't exist
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

// Setup logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
};

// Save progress
const saveProgress = (data) => {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
};

// Load progress
const loadProgress = () => {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    processed: 0,
    successful: 0,
    failed: 0,
    totalFound: 0,
    currentBatch: 0,
    errors: []
  };
};

// Get all RIAs without narratives first (more reliable approach)
async function getAllRIAsWithoutNarratives() {
  try {
    log('Finding ALL RIAs without narratives...');
    
    // Get ALL RIAs that don't have corresponding narratives (need to paginate)
    let allRIAs = [];
    let start = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('ria_profiles')
        .select('crd_number, legal_name, city, state, aum, website, phone')
        .not('legal_name', 'ilike', 'Investment Adviser (CRD #%')
        .not('legal_name', 'is', null)
        .order('crd_number', { ascending: true })
        .range(start, start + pageSize - 1);
        
      if (error) {
        throw error;
      }
      
      if (!batch || batch.length === 0) {
        break;
      }
      
      allRIAs.push(...batch);
      log(`Fetched ${allRIAs.length} RIAs so far...`);
      
      if (batch.length < pageSize) {
        break; // Last page
      }
      
      start += pageSize;
    }
    
    const riasWithoutNarratives = allRIAs;
      
    // Error handling is now in the while loop above
    
    log(`Found ${riasWithoutNarratives.length} potential RIAs to check`);
    
    // Filter out those that already have narratives
    const riasNeedingNarratives = [];
    
    // Process in chunks to avoid overwhelming the database
    const chunkSize = 1000;
    for (let i = 0; i < riasWithoutNarratives.length; i += chunkSize) {
      const chunk = riasWithoutNarratives.slice(i, i + chunkSize);
      const crdNumbers = chunk.map(r => r.crd_number);
      
      // Check which of these CRDs already have narratives
      const { data: existingNarratives, error: narrativeError } = await supabase
        .from('narratives')
        .select('crd_number')
        .in('crd_number', crdNumbers);
        
      if (narrativeError) {
        log(`Error checking narratives for chunk ${i}: ${narrativeError.message}`);
        continue;
      }
      
      // Get CRDs that don't have narratives
      const existingCRDs = new Set(existingNarratives.map(n => n.crd_number));
      const riasWithoutNarrativesInChunk = chunk.filter(ria => !existingCRDs.has(ria.crd_number));
      
      riasNeedingNarratives.push(...riasWithoutNarrativesInChunk);
      
      log(`Processed chunk ${i + 1}-${Math.min(i + chunkSize, riasWithoutNarratives.length)}: Found ${riasWithoutNarrativesInChunk.length} RIAs needing narratives`);
    }
    
    log(`Total RIAs needing narratives: ${riasNeedingNarratives.length}`);
    return riasNeedingNarratives;
    
  } catch (error) {
    log(`Error getting RIAs without narratives: ${error.message}`);
    return [];
  }
}

// Generate narrative with Google AI
async function generateNarrative(riaProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
Generate a concise investment advisory narrative for "${riaProfile.legal_name}" (CRD #${riaProfile.crd_number}).

Key Information:
- Location: ${riaProfile.city || 'N/A'}, ${riaProfile.state || 'N/A'}
- Assets Under Management: $${(riaProfile.aum || 0).toLocaleString()}
- Website: ${riaProfile.website || 'Not provided'}
- Phone: ${riaProfile.phone || 'Not provided'}

Create a professional, factual 3-4 sentence narrative summarizing their likely advisory approach, target clients, and investment philosophy based on their size and location. Focus on what would make them unique for their market.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (error) {
    log(`Error generating narrative for CRD ${riaProfile.crd_number}: ${error.message}`);
    throw error;
  }
}

// Store narrative in database
async function storeNarrative(crdNumber, narrativeText) {
  try {
    const narrativeData = {
      crd_number: crdNumber,
      narrative: narrativeText,
    };
    
    const { data, error } = await supabase
      .from('narratives')
      .insert([narrativeData]);
      
    if (error) {
      log(`Error storing narrative for CRD ${crdNumber}: ${error.message}`);
      return false;
    }
    
    return true;
  } catch (error) {
    log(`Exception storing narrative for CRD ${crdNumber}: ${error.message}`);
    return false;
  }
}

// Process a single RIA
async function processRIA(ria, retryCount = 0) {
  try {
    // Generate narrative
    const narrative = await generateNarrative(ria);
    
    // Store narrative
    const success = await storeNarrative(ria.crd_number, narrative);
    
    if (success) {
      log(`✅ CRD #${ria.crd_number} - ${ria.legal_name}`);
      return true;
    } else {
      throw new Error('Failed to store narrative');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`🔄 Retrying CRD #${ria.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      return processRIA(ria, retryCount + 1);
    } else {
      log(`❌ Failed CRD #${ria.crd_number}: ${error.message}`);
      return false;
    }
  }
}

// Process a batch of RIAs
async function processBatch(rias) {
  const results = [];
  
  for (const ria of rias) {
    const success = await processRIA(ria);
    results.push({
      crd: ria.crd_number,
      success
    });
  }
  
  return results;
}

// Main function
async function main() {
  log('🚀 Starting complete narrative generation...');
  
  // First, find all RIAs that need narratives
  const allRIAsNeedingNarratives = await getAllRIAsWithoutNarratives();
  
  if (allRIAsNeedingNarratives.length === 0) {
    log('✅ No RIAs found that need narratives');
    return;
  }
  
  log(`📋 Found ${allRIAsNeedingNarratives.length} RIAs that need narratives`);
  
  let progress = loadProgress();
  progress.totalFound = allRIAsNeedingNarratives.length;
  saveProgress(progress);
  
  log(`📊 Progress so far: ${progress.processed}/${progress.totalFound} (${progress.successful} successful, ${progress.failed} failed)`);
  
  // Process in batches
  const totalBatches = Math.ceil(allRIAsNeedingNarratives.length / BATCH_SIZE);
  
  for (let batchIndex = progress.currentBatch; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * BATCH_SIZE;
    const endIndex = Math.min(startIndex + BATCH_SIZE, allRIAsNeedingNarratives.length);
    const batch = allRIAsNeedingNarratives.slice(startIndex, endIndex);
    
    log(`\n🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} RIAs)`);
    
    try {
      // Process batch
      const results = await processBatch(batch);
      
      // Update progress
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      progress.processed += batch.length;
      progress.successful += successful;
      progress.failed += failed;
      progress.currentBatch = batchIndex + 1;
      
      // Save progress
      saveProgress(progress);
      
      // Log batch results
      log(`✅ Batch ${batchIndex + 1} completed: ${successful} successful, ${failed} failed`);
      log(`📊 Total progress: ${progress.processed}/${progress.totalFound} (${((progress.processed / progress.totalFound) * 100).toFixed(1)}%)`);
      
      // Calculate new coverage
      const currentNarratives = 81574 + progress.successful;
      const currentCoverage = ((currentNarratives / 103620) * 100).toFixed(2);
      log(`📈 Current narrative coverage: ${currentNarratives}/103620 (${currentCoverage}%)`);
      
      // Delay between batches
      if (batchIndex < totalBatches - 1) {
        log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
      
    } catch (error) {
      log(`❌ Error processing batch ${batchIndex + 1}: ${error.message}`);
      progress.errors.push({
        timestamp: new Date().toISOString(),
        batch: batchIndex + 1,
        message: error.message
      });
      saveProgress(progress);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2));
    }
  }
  
  log('\n🎉 Complete narrative generation finished!');
  log(`📊 Final results: ${progress.successful} successful, ${progress.failed} failed out of ${progress.totalFound} total`);
  
  const finalNarratives = 81574 + progress.successful;
  const finalCoverage = ((finalNarratives / 103620) * 100).toFixed(2);
  log(`📈 Final narrative coverage: ${finalNarratives}/103620 (${finalCoverage}%)`);
}

// Run the main function
main().catch(error => {
  log(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});
