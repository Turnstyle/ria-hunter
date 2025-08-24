// Simple Narrative Generator
// A straightforward approach to generating narratives for RIAs without existing narratives
// Uses Google AI for generation with proper rate limiting

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
const BATCH_SIZE = 5; // Small batch size to avoid rate limits
const DELAY_BETWEEN_BATCHES = 10000; // 10 seconds between batches
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'simple_narrative_generation.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'narrative_progress.json');

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
    lastProcessedCRD: 0,
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
    log(`Error generating narrative for CRD ${riaProfile.crd_number}: ${error.message}`);
    throw error;
  }
}

// Get RIAs without narratives
async function getRIAsWithoutNarratives(lastProcessedCRD, limit) {
  try {
    const { data: rias, error } = await supabase
      .from('ria_profiles')
      .select('*')
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(limit);
      
    if (error) {
      log(`Error fetching RIAs: ${error.message}`);
      return [];
    }
    
    // For each RIA, check if it already has a narrative
    const riasWithoutNarratives = [];
    
    for (const ria of rias) {
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
      }
    }
    
    return riasWithoutNarratives;
  } catch (error) {
    log(`Error in getRIAsWithoutNarratives: ${error.message}`);
    return [];
  }
}

// Store narrative in database
async function storeNarrative(crdNumber, narrative) {
  try {
    // First, let's check the schema to see what columns are available
    const { data: schemaData, error: schemaError } = await supabase
      .from('narratives')
      .select('*')
      .limit(1);
      
    if (schemaError) {
      log(`Error checking schema: ${schemaError.message}`);
      return false;
    }
    
    // Create a narrative object with only the columns that exist
    const narrativeData = {
      crd_number: crdNumber,
      narrative_text: narrative,
      narrative_type: 'ai_generated'
    };
    
    // Add created_at if it exists in the schema
    if (schemaData[0]?.hasOwnProperty('created_at')) {
      narrativeData.created_at = new Date().toISOString();
    }
    
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
  log(`Starting simple narrative generation from CRD #${progress.lastProcessedCRD}`);
  log(`Progress so far: Processed ${progress.processed}, Successful ${progress.successful}, Failed ${progress.failed}`);
  
  let running = true;
  let emptyBatchCount = 0;
  
  while (running) {
    try {
      // Get batch of RIAs without narratives
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
      log(`Current narrative coverage: ${progress.successful + 42487} / 103620 (${((progress.successful + 42487) / 103620 * 100).toFixed(2)}%)`);
      
      // Delay between batches to avoid rate limits
      log(`Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    } catch (error) {
      log(`Error in main loop: ${error.message}`);
      progress.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message
      });
      saveProgress(progress);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2));
    }
  }
  
  log('Narrative generation complete');
  log(`Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  log(`Final narrative coverage: ${progress.successful + 42487} / 103620 (${((progress.successful + 42487) / 103620 * 100).toFixed(2)}%)`);
}

// Run the main function
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
