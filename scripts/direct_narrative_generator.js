// Direct Narrative Generator for Phase 2.1
// Uses direct SQL approach to find RIAs without narratives

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
const BATCH_SIZE = 3; // Very conservative to avoid rate limits
const DELAY_BETWEEN_BATCHES = 10000; // 10 second delay
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'direct_narrative_generation.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'direct_narrative_progress.json');

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
    skipped: 0,
    lastProcessedCRD: 0,
    errors: []
  };
};

// Generate narrative with Google AI
async function generateNarrative(riaProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
Generate a concise investment advisory narrative for "${riaProfile.legal_name}" (CRD #${riaProfile.crd_number}).

Key Information:
- Location: ${riaProfile.city || 'N/A'}, ${riaProfile.state || 'N/A'}
- Assets Under Management: $${(riaProfile.aum || 0).toLocaleString()}
- CRD Number: ${riaProfile.crd_number}

Create a professional, factual 3-4 sentence narrative summarizing their advisory services, client focus, and business approach. Focus on specific services and avoid generic language.
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

// Get RIAs without narratives using a simpler batch approach
async function getRIAsWithoutNarratives(lastProcessedCRD, limit) {
  try {
    log(`Searching for RIAs without narratives starting from CRD ${lastProcessedCRD}...`);
    
    // Get RIA profiles in batches and check them
    const { data: riaProfiles, error: riaError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(50); // Check 50 RIAs at a time
      
    if (riaError) {
      log(`Error fetching RIA profiles: ${riaError.message}`);
      return [];
    }
    
    if (!riaProfiles || riaProfiles.length === 0) {
      log('No more RIA profiles found');
      return [];
    }
    
    log(`Checking ${riaProfiles.length} RIA profiles for missing narratives...`);
    
    // Check which ones don't have narratives
    const riasWithoutNarratives = [];
    
    for (const ria of riaProfiles) {
      const { count, error: narrativeError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
        .eq('crd_number', ria.crd_number);
        
      if (narrativeError) {
        log(`Error checking narrative for CRD ${ria.crd_number}: ${narrativeError.message}`);
        continue;
      }
      
      if (count === 0) {
        riasWithoutNarratives.push(ria);
        log(`Found RIA without narrative: CRD ${ria.crd_number} - ${ria.legal_name}`);
        
        if (riasWithoutNarratives.length >= limit) {
          break;
        }
      }
    }
    
    log(`Found ${riasWithoutNarratives.length} RIAs without narratives in this batch`);
    return riasWithoutNarratives;
  } catch (error) {
    log(`Error in getRIAsWithoutNarratives: ${error.message}`);
    return [];
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
    log(`Processing RIA: ${ria.legal_name} (CRD #${ria.crd_number})`);
    
    // Generate narrative
    const narrative = await generateNarrative(ria);
    
    // Store narrative
    const success = await storeNarrative(ria.crd_number, narrative);
    
    if (success) {
      log(`✅ Successfully processed CRD #${ria.crd_number}`);
      return true;
    } else {
      throw new Error('Failed to store narrative');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`Retrying CRD #${ria.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before retry
      return processRIA(ria, retryCount + 1);
    } else {
      log(`❌ Failed to process CRD #${ria.crd_number} after ${MAX_RETRIES} attempts: ${error.message}`);
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
    
    // Delay between individual RIA processing
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

// Main function
async function main() {
  let progress = loadProgress();
  log(`🚀 Starting direct narrative generation from CRD #${progress.lastProcessedCRD}`);
  log(`📊 Progress so far: Processed ${progress.processed}, Successful ${progress.successful}, Failed ${progress.failed}`);
  log(`⚙️ Settings: Batch size ${BATCH_SIZE}, Delay ${DELAY_BETWEEN_BATCHES/1000}s`);
  
  // Get current counts
  const { count: riaCount, error: riaCountError } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true });
    
  const { count: narrativeCount, error: narrativeCountError } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true });
    
  log(`📊 Current status: ${narrativeCount || 0} narratives for ${riaCount || 0} RIAs`);
  
  let running = true;
  let emptyBatchCount = 0;
  let processedInThisRun = 0;
  
  while (running) {
    try {
      // Get batch of RIAs without narratives
      const batch = await getRIAsWithoutNarratives(progress.lastProcessedCRD, BATCH_SIZE);
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`No RIAs without narratives found (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 5) {
          log('✅ No more RIAs without narratives found');
          running = false;
          break;
        }
        
        // Skip ahead to continue searching
        const skipAmount = 10000;
        progress.lastProcessedCRD += skipAmount;
        saveProgress(progress);
        log(`⏭️ Skipping ahead by ${skipAmount} to CRD #${progress.lastProcessedCRD}`);
        
        // If we've skipped too far, we're probably done
        if (progress.lastProcessedCRD > 200000) {
          log('✅ Reached end of CRD range, stopping');
          running = false;
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      emptyBatchCount = 0;
      log(`📦 Processing batch of ${batch.length} RIAs`);
      
      // Process batch
      const results = await processBatch(batch);
      
      // Update progress
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      progress.processed += batch.length;
      progress.successful += successful;
      progress.failed += failed;
      progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
      processedInThisRun += successful;
      
      // Save progress
      saveProgress(progress);
      
      log(`📊 Batch completed: ${successful} successful, ${failed} failed`);
      log(`📈 Total progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
      log(`🎯 New narratives in this run: ${processedInThisRun}`);
      
      // Get updated narrative count
      const { count: updatedNarrativeCount, error: updatedCountError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true });
        
      const currentTotal = updatedNarrativeCount || 0;
      log(`📖 Current total narratives: ${currentTotal}`);
      
      // Delay between batches to avoid rate limits
      log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    } catch (error) {
      log(`❌ Error in main loop: ${error.message}`);
      
      progress.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message
      });
      saveProgress(progress);
      
      // Wait longer before retrying if we hit an error
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2));
    }
  }
  
  log('🎉 Direct narrative generation complete');
  log(`📊 Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  log(`🆕 New narratives generated in this run: ${processedInThisRun}`);
}

// Run the main function
main().catch(error => {
  log(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});
