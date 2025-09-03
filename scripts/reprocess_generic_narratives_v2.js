#!/usr/bin/env node
/**
 * Reprocess Narratives Script (v2)
 * 
 * This script finds and reprocesses narratives that were generated before RIA names were fixed
 * and contain generic references like "Undefined (CRD# XXXXX)" instead of proper company names.
 */

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
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'reprocess_narratives_v2.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'reprocess_narratives_v2_progress.json');

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
    processedCRDs: [],
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

// Get narratives that need reprocessing
async function getNarrativesForReprocessing(processedCRDs, limit) {
  try {
    let query = supabase
      .from('narratives')
      .select('id, narrative, crd_number')
      .ilike('narrative', '%Investment Adviser (CRD #%')
      .limit(limit * 3); // Get more than needed to filter
      
    // If we have processed CRDs, exclude them
    if (processedCRDs.length > 0) {
      query = query.not('crd_number', 'in', `(${processedCRDs.join(',')})`);
    }
      
    const { data: narratives, error } = await query;
      
    if (error) {
      log(`Error fetching narratives: ${error.message}`);
      return [];
    }
    
    // Return only up to the limit
    return narratives ? narratives.slice(0, limit) : [];
  } catch (error) {
    log(`Exception fetching narratives: ${error.message}`);
    return [];
  }
}

// Update narrative in database
async function updateNarrative(id, crdNumber, narrativeText) {
  try {
    const { error } = await supabase
      .from('narratives')
      .update({ narrative: narrativeText })
      .eq('id', id);
      
    if (error) {
      log(`Error updating narrative for ID ${id} (CRD ${crdNumber}): ${error.message}`);
      return false;
    }
    
    log(`Successfully updated narrative for ID ${id} (CRD ${crdNumber})`);
    return true;
  } catch (error) {
    log(`Exception updating narrative for ID ${id} (CRD ${crdNumber}): ${error.message}`);
    return false;
  }
}

// Process a single narrative
async function processNarrative(narrative, retryCount = 0) {
  try {
    const crdNumber = narrative.crd_number;
    
    // Get RIA profile with the fixed name
    const { data: riaProfiles, error: riaError } = await supabase
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', crdNumber)
      .limit(1);
      
    if (riaError || !riaProfiles || riaProfiles.length === 0) {
      log(`Error fetching RIA profile for CRD ${crdNumber}: ${riaError?.message || 'Not found'}`);
      return false;
    }
    
    const riaProfile = riaProfiles[0];
    
    // Check if the name is still generic/undefined
    if (!riaProfile.legal_name || riaProfile.legal_name.includes('Investment Adviser (CRD #')) {
      log(`⚠️ RIA CRD ${crdNumber} still has a generic name: "${riaProfile.legal_name}". Skipping.`);
      return false;
    }
    
    log(`Processing narrative ID ${narrative.id} for ${riaProfile.legal_name} (CRD #${crdNumber})`);
    
    // Generate new narrative with the proper name
    const newNarrative = await generateNarrative(riaProfile);
    
    // Update the narrative in the database
    const success = await updateNarrative(narrative.id, crdNumber, newNarrative);
    
    if (success) {
      log(`✅ Successfully reprocessed narrative for ${riaProfile.legal_name} (CRD #${crdNumber})`);
      return true;
    } else {
      throw new Error('Failed to update narrative');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`Retrying narrative ID ${narrative.id} (CRD #${narrative.crd_number}) (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      return processNarrative(narrative, retryCount + 1);
    } else {
      log(`❌ Failed to process narrative ID ${narrative.id} (CRD #${narrative.crd_number}) after ${MAX_RETRIES} attempts: ${error.message}`);
      return false;
    }
  }
}

// Process a batch of narratives
async function processBatch(narratives) {
  const results = [];
  const processedCRDs = [];
  
  for (const narrative of narratives) {
    const success = await processNarrative(narrative);
    results.push({
      id: narrative.id,
      crd: narrative.crd_number,
      success
    });
    
    processedCRDs.push(narrative.crd_number);
  }
  
  return {results, processedCRDs};
}

// Main function
async function main() {
  let progress = loadProgress();
  log(`Starting narrative reprocessing (v2)`);
  log(`Progress so far: Processed ${progress.processed}, Successful ${progress.successful}, Failed ${progress.failed}`);
  log(`Settings: Batch size ${BATCH_SIZE}, Delay ${DELAY_BETWEEN_BATCHES/1000}s`);
  
  // Get total count of narratives that need reprocessing
  const { count, error: countError } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .ilike('narrative', '%Investment Adviser (CRD #%');
    
  if (countError) {
    log(`Error getting total count: ${countError.message}`);
  } else {
    log(`Found ${count} narratives that need reprocessing`);
  }
  
  let running = true;
  let emptyBatchCount = 0;
  
  while (running) {
    try {
      // Check if we've hit rate limits too many times
      if (rateLimitHits >= MAX_RATE_LIMIT_HITS) {
        log(`⚠️ Rate limiting detected. Increasing delay between batches.`);
        DELAY_BETWEEN_BATCHES = 30000; // 30 seconds
        log(`New delay: ${DELAY_BETWEEN_BATCHES/1000}s`);
        rateLimitHits = 0;
      }
      
      // Get batch of narratives for reprocessing
      const batch = await getNarrativesForReprocessing(progress.processedCRDs || [], BATCH_SIZE);
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`No more narratives found for reprocessing (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 3) {
          log('Reached end of narratives for reprocessing');
          running = false;
          break;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        continue;
      }
      
      emptyBatchCount = 0;
      log(`Processing batch of ${batch.length} narratives`);
      
      // Process batch
      const {results, processedCRDs} = await processBatch(batch);
      
      // Update progress
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      progress.processed += batch.length;
      progress.successful += successful;
      progress.failed += failed;
      
      // Add processed CRDs to the list
      if (!progress.processedCRDs) {
        progress.processedCRDs = [];
      }
      progress.processedCRDs = [...progress.processedCRDs, ...processedCRDs];
      
      // Save progress
      saveProgress(progress);
      
      log(`Batch completed: ${successful} successful, ${failed} failed`);
      log(`Total progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
      
      // Get current completion percentage
      const completionPercentage = count ? ((progress.processed / count) * 100).toFixed(2) : 'unknown';
      log(`Completion: ${progress.processed}/${count} (${completionPercentage}%)`);
      
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
      
      // Wait longer before retrying if we hit an error
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES * 2));
    }
  }
  
  log('Narrative reprocessing complete');
  log(`Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
}

// Run the main function
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
