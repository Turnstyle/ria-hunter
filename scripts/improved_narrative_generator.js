// Improved Narrative Generator
// Modified to skip undefined names and optimized for performance

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

// Configuration - OPTIMIZED
const BATCH_SIZE = 10; // Using 10 records per batch
const DELAY_BETWEEN_BATCHES = 5000; // 5 second delay
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'improved_narrative_generation.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'improved_narrative_progress.json');

// Track rate limiting
let rateLimitHits = 0;
const MAX_RATE_LIMIT_HITS = 3;

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
    lastProcessedCRD: 0, // Start from the beginning
    errors: []
  };
};

// Generate narrative with Google AI
async function generateNarrative(riaProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
Generate a concise investment advisory narrative for "${riaProfile.legal_name || riaProfile.firm_name}" (CRD #${riaProfile.crd_number}).

Key Information:
- Location: ${riaProfile.city || 'N/A'}, ${riaProfile.state || 'N/A'}
- Assets Under Management: $${(riaProfile.aum || 0).toLocaleString()}
- Services: ${riaProfile.services?.join(', ') || 'Various investment services'}
- Client Types: ${riaProfile.client_types?.join(', ') || 'Various client types'}

Create a professional, factual 3-4 sentence narrative summarizing their advisory approach, target clients, and investment philosophy. Focus on what makes them unique or specialized.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (error) {
    // Check if this is a rate limiting error
    if (error.message && error.message.toLowerCase().includes('rate') && error.message.toLowerCase().includes('limit')) {
      rateLimitHits++;
      log(`⚠️ Rate limit hit ${rateLimitHits}/${MAX_RATE_LIMIT_HITS}`);
      
      if (rateLimitHits >= MAX_RATE_LIMIT_HITS) {
        log(`⚠️ Too many rate limit hits. Consider reverting to original parameters.`);
      }
    }
    
    log(`Error generating narrative for CRD ${riaProfile.crd_number}: ${error.message}`);
    throw error;
  }
}

// Get RIAs without narratives
async function getRIAsWithoutNarratives(lastProcessedCRD, limit) {
  try {
    // Get all RIAs above the last processed CRD
    const { data: rias, error } = await supabase
      .from('ria_profiles')
      .select('*')
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(limit * 5); // Get more than we need to filter
      
    if (error) {
      log(`Error fetching RIAs: ${error.message}`);
      return [];
    }
    
    if (!rias || rias.length === 0) {
      return [];
    }
    
    // For each RIA, check if it already has a narrative and has a name
    const riasWithoutNarratives = [];
    const skippedRIAs = [];
    
    for (const ria of rias) {
      // Skip RIAs with undefined names
      if (!ria.legal_name && !ria.firm_name) {
        skippedRIAs.push(ria.crd_number);
        continue;
      }
      
      const { data: narratives, error: narrativesError } = await supabase
        .from('narratives')
        .select('id')
        .eq('crd_number', ria.crd_number)
        .limit(1);
        
      if (narrativesError) {
        log(`Error checking narratives for CRD ${ria.crd_number}: ${narrativesError.message}`);
        continue;
      }
      
      if (!narratives || narratives.length === 0) {
        riasWithoutNarratives.push(ria);
        
        // If we have enough, stop checking
        if (riasWithoutNarratives.length >= limit) {
          break;
        }
      }
    }
    
    if (skippedRIAs.length > 0) {
      log(`Skipped ${skippedRIAs.length} RIAs with undefined names: ${skippedRIAs.slice(0, 5).join(', ')}${skippedRIAs.length > 5 ? '...' : ''}`);
    }
    
    return riasWithoutNarratives;
  } catch (error) {
    log(`Error in getRIAsWithoutNarratives: ${error.message}`);
    return [];
  }
}

// Store narrative in database
async function storeNarrative(crdNumber, narrativeText) {
  try {
    // Create a narrative object using correct column names
    const narrativeData = {
      crd_number: crdNumber,
      narrative: narrativeText,  // Use 'narrative' instead of 'narrative_text'
    };
    
    // Insert the narrative
    const { data, error } = await supabase
      .from('narratives')
      .insert([narrativeData]);
      
    if (error) {
      log(`Error storing narrative for CRD ${crdNumber}: ${error.message}`);
      return false;
    }
    
    log(`Successfully inserted narrative for CRD ${crdNumber}`);
    return true;
  } catch (error) {
    log(`Exception storing narrative for CRD ${crdNumber}: ${error.message}`);
    return false;
  }
}

// Process a single RIA
async function processRIA(ria, retryCount = 0) {
  try {
    log(`Processing RIA: ${ria.legal_name || ria.firm_name} (CRD #${ria.crd_number})`);
    
    // Generate narrative
    const narrative = await generateNarrative(ria);
    
    // Store narrative
    const success = await storeNarrative(ria.crd_number, narrative);
    
    if (success) {
      log(`✅ Successfully generated and stored narrative for CRD #${ria.crd_number}`);
      return true;
    } else {
      throw new Error('Failed to store narrative');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`Retrying CRD #${ria.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
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
  }
  
  return results;
}

// Main function
async function main() {
  let progress = loadProgress();
  log(`Starting improved narrative generation from CRD #${progress.lastProcessedCRD}`);
  log(`Progress so far: Processed ${progress.processed}, Successful ${progress.successful}, Failed ${progress.failed}, Skipped ${progress.skipped || 0}`);
  log(`OPTIMIZED SETTINGS: Batch size ${BATCH_SIZE}, Delay ${DELAY_BETWEEN_BATCHES/1000}s`);
  log(`IMPROVEMENT: Skipping RIAs with undefined names`);
  
  let running = true;
  let emptyBatchCount = 0;
  
  // Calculate the current total narratives (starting with what exists)
  const { data: existingCount, error: countError } = await supabase
    .from('narratives')
    .select('count');
    
  const baseNarrativeCount = existingCount && existingCount[0] ? existingCount[0].count : 0;
  log(`Current narrative count: ${baseNarrativeCount}`);
  
  while (running) {
    try {
      // Check if we've hit rate limits too many times
      if (rateLimitHits >= MAX_RATE_LIMIT_HITS) {
        log(`⚠️ Rate limiting detected. Reverting to safer settings.`);
        if (BATCH_SIZE > 5) {
          log(`Reducing batch size from ${BATCH_SIZE} to 5, keeping delay at ${DELAY_BETWEEN_BATCHES/1000}s`);
          process.exit(2);
        } else if (DELAY_BETWEEN_BATCHES < 30000) {
          log(`Increasing delay from ${DELAY_BETWEEN_BATCHES/1000}s to 30s, keeping batch size at ${BATCH_SIZE}`);
          process.exit(3);
        } else {
          log(`Already at safe settings. Exiting to allow restart.`);
          process.exit(0);
        }
      }
      
      // Get batch of RIAs without narratives (will skip undefined names)
      const batch = await getRIAsWithoutNarratives(progress.lastProcessedCRD, BATCH_SIZE);
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`No more RIAs found without narratives (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 3) {
          log('Reached end of RIAs without narratives');
          running = false;
          break;
        }
        
        // Skip ahead by 1000 CRDs to find more
        progress.lastProcessedCRD += 1000;
        saveProgress(progress);
        log(`Skipping ahead to CRD #${progress.lastProcessedCRD}`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        continue;
      }
      
      emptyBatchCount = 0;
      log(`Processing batch of ${batch.length} RIAs`);
      
      // Process batch
      const results = await processBatch(batch);
      
      // Update progress
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      progress.processed += batch.length;
      progress.successful += successful;
      progress.failed += failed;
      progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
      
      // Save progress
      saveProgress(progress);
      
      log(`Batch completed: ${successful} successful, ${failed} failed`);
      log(`Total progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
      
      // Get current narrative count
      const { data: currentCount, error: currentCountError } = await supabase
        .from('narratives')
        .select('count');
        
      const currentNarratives = currentCount && currentCount[0] ? currentCount[0].count : baseNarrativeCount;
      log(`Current narrative coverage: ${currentNarratives} / 103620 (${((currentNarratives / 103620) * 100).toFixed(2)}%)`);
      
      // Delay between batches to avoid rate limits
      log(`Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    } catch (error) {
      log(`Error in main loop: ${error.message}`);
      
      // Check if this is a rate limiting error
      if (error.message && error.message.toLowerCase().includes('rate') && error.message.toLowerCase().includes('limit')) {
        rateLimitHits++;
        log(`⚠️ Rate limit hit in main loop ${rateLimitHits}/${MAX_RATE_LIMIT_HITS}`);
      }
      
      progress.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message
      });
      saveProgress(progress);
      
      // Wait longer before retrying if we hit an error
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2));
    }
  }
  
  log('Narrative generation complete');
  log(`Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  
  // Get final narrative count
  const { data: finalCount, error: finalCountError } = await supabase
    .from('narratives')
    .select('count');
    
  const finalNarratives = finalCount && finalCount[0] ? finalCount[0].count : baseNarrativeCount;
  log(`Final narrative coverage: ${finalNarratives} / 103620 (${((finalNarratives / 103620) * 100).toFixed(2)}%)`);
}

// Run the main function
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
