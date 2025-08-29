#!/usr/bin/env node
/**
 * Corrected Reprocess Narratives Script
 * 
 * Fixed to work with UUID primary keys in the narratives table
 * This script finds and reprocesses narratives that contain "Undefined" patterns
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
const BATCH_SIZE = 5; // Conservative batch size
const DELAY_BETWEEN_BATCHES = 8000; // 8 seconds to avoid conflicts with other script
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'corrected_reprocess_narratives.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'corrected_reprocess_progress.json');

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
    lastProcessedCRD: 0, // Use CRD instead of UUID ID
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

Create a professional, factual 3-4 sentence narrative summarizing their advisory services, client focus, and investment philosophy. Focus on what makes them unique and avoid generic language.
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
    }
    
    log(`Error generating narrative for CRD ${riaProfile.crd_number}: ${error.message}`);
    throw error;
  }
}

// Get narratives that need reprocessing (using CRD-based pagination)
async function getNarrativesForReprocessing(lastProcessedCRD, limit) {
  try {
    const { data: narratives, error } = await supabase
      .from('narratives')
      .select('id, narrative, crd_number')
      .ilike('narrative', 'Undefined (%')
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(limit);
      
    if (error) {
      log(`Error fetching narratives: ${error.message}`);
      return [];
    }
    
    return narratives || [];
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
    
    log(`🔄 Reprocessing narrative for ${riaProfile.legal_name} (CRD #${crdNumber})`);
    
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
      log(`Retrying narrative for CRD #${narrative.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return processNarrative(narrative, retryCount + 1);
    } else {
      log(`❌ Failed to process narrative for CRD #${narrative.crd_number} after ${MAX_RETRIES} attempts: ${error.message}`);
      return false;
    }
  }
}

// Process a batch of narratives
async function processBatch(narratives) {
  const results = [];
  
  for (const narrative of narratives) {
    const success = await processNarrative(narrative);
    results.push({
      id: narrative.id,
      crd: narrative.crd_number,
      success
    });
    
    // Delay between individual narratives
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

// Main function
async function main() {
  let progress = loadProgress();
  log(`🔄 Starting corrected narrative reprocessing from CRD ${progress.lastProcessedCRD}`);
  log(`📊 Progress so far: Processed ${progress.processed}, Successful ${progress.successful}, Failed ${progress.failed}`);
  log(`⚙️ Settings: Batch size ${BATCH_SIZE}, Delay ${DELAY_BETWEEN_BATCHES/1000}s`);
  
  // Get total count of narratives that need reprocessing
  const { count, error: countError } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .ilike('narrative', 'Undefined (%');
    
  if (countError) {
    log(`Error getting total count: ${countError.message}`);
  } else {
    log(`📋 Found ${count} narratives that need reprocessing`);
  }
  
  let running = true;
  let emptyBatchCount = 0;
  let processedInThisRun = 0;
  
  while (running) {
    try {
      // Check if we've hit rate limits too many times
      if (rateLimitHits >= MAX_RATE_LIMIT_HITS) {
        log(`⚠️ Rate limiting detected. Increasing delay.`);
        DELAY_BETWEEN_BATCHES = 15000; // 15 seconds
        rateLimitHits = 0;
      }
      
      // Get batch of narratives for reprocessing
      const batch = await getNarrativesForReprocessing(progress.lastProcessedCRD, BATCH_SIZE);
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`No more undefined narratives found (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 5) {
          log('✅ Reached end of undefined narratives');
          running = false;
          break;
        }
        
        // Skip ahead by CRD numbers
        const skipAmount = 20000;
        progress.lastProcessedCRD += skipAmount;
        saveProgress(progress);
        log(`⏭️ Skipping ahead by ${skipAmount} to CRD ${progress.lastProcessedCRD}`);
        
        if (progress.lastProcessedCRD > 200000) {
          log('✅ Reached end of CRD range, stopping');
          running = false;
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      emptyBatchCount = 0;
      log(`📦 Processing batch of ${batch.length} undefined narratives`);
      
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
      log(`🔄 Reprocessed in this run: ${processedInThisRun}`);
      
      // Get current completion percentage
      const completionPercentage = count ? ((progress.processed / count) * 100).toFixed(2) : 'unknown';
      log(`📊 Completion: ${progress.processed}/${count} (${completionPercentage}%)`);
      
      // Delay between batches to avoid rate limits and conflicts
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
  
  log('🎉 Corrected narrative reprocessing complete');
  log(`📊 Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  log(`🔄 Total reprocessed in this run: ${processedInThisRun}`);
}

// Run the main function
main().catch(error => {
  log(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});
