// Corrected Phase 2.4: Embedding Generator
// Uses the working Vertex AI predict method for embeddings

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

if (!projectId) {
  console.error('Missing Google Cloud Project ID');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const vertex = new VertexAI({ 
  project: projectId,
  location: 'us-central1' 
});

// Get the embedding model using the working approach
const embeddingModel = vertex.preview.getGenerativeModel({
  model: 'textembedding-gecko@003',
});

// Configuration
const BATCH_SIZE = 8; // Process fewer at a time to avoid rate limits
const DELAY_BETWEEN_BATCHES = 15000; // 15 seconds to avoid conflicts
const MAX_RETRIES = 3;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'corrected_embedding_generation.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'corrected_embedding_progress.json');

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

// Generate embedding using the working Vertex AI predict method
async function generateEmbedding(text) {
  try {
    const instances = [{ content: text }];
    const request = { instances };
    
    const result = await embeddingModel.predict(request);
    
    if (result.predictions && result.predictions[0] && result.predictions[0].embeddings && result.predictions[0].embeddings.values) {
      return result.predictions[0].embeddings.values;
    }
    
    throw new Error('No embedding values returned from Vertex AI');
  } catch (error) {
    log(`Error generating embedding: ${error.message}`);
    throw error;
  }
}

// Get narratives without embeddings using CRD-based pagination
async function getNarrativesWithoutEmbeddings(lastProcessedCRD, limit) {
  try {
    const { data: narratives, error } = await supabase
      .from('narratives')
      .select('id, narrative, crd_number')
      .is('embedding', null)
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(limit);
    
    if (error) {
      log(`Error fetching narratives: ${error.message}`);
      return [];
    }
    
    return narratives || [];
  } catch (error) {
    log(`Exception in getNarrativesWithoutEmbeddings: ${error.message}`);
    return [];
  }
}

// Update narrative with embedding
async function updateNarrativeEmbedding(id, crdNumber, embedding) {
  try {
    const { error } = await supabase
      .from('narratives')
      .update({ embedding: embedding })
      .eq('id', id);
      
    if (error) {
      log(`Error updating embedding for CRD ${crdNumber}: ${error.message}`);
      return false;
    }
    
    return true;
  } catch (error) {
    log(`Exception updating embedding for CRD ${crdNumber}: ${error.message}`);
    return false;
  }
}

// Process a single narrative
async function processNarrative(narrative, retryCount = 0) {
  try {
    log(`🧠 Generating embedding for CRD ${narrative.crd_number}`);
    
    // Generate embedding
    const embedding = await generateEmbedding(narrative.narrative);
    
    // Update narrative with embedding
    const success = await updateNarrativeEmbedding(narrative.id, narrative.crd_number, embedding);
    
    if (success) {
      log(`✅ Successfully generated embedding for CRD ${narrative.crd_number}`);
      return true;
    } else {
      throw new Error('Failed to update narrative with embedding');
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`⚠️ Retrying CRD ${narrative.crd_number} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
      return processNarrative(narrative, retryCount + 1);
    } else {
      log(`❌ Failed to process CRD ${narrative.crd_number} after ${MAX_RETRIES} attempts: ${error.message}`);
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
  log(`🚀 Starting Corrected Phase 2.4: Embedding Generation`);
  log(`📊 Progress so far: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  log(`⚙️ Settings: Batch size ${BATCH_SIZE}, Delay ${DELAY_BETWEEN_BATCHES/1000}s`);
  
  // Get current counts
  const { count: totalNarratives, error: totalError } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true });
    
  const { count: embeddingCount, error: embeddingError } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);
    
  const remainingEmbeddings = (totalNarratives || 0) - (embeddingCount || 0);
  
  log(`📊 Current status: ${embeddingCount || 0} embeddings exist, ${remainingEmbeddings} remaining`);
  
  if (remainingEmbeddings <= 0) {
    log(`🎉 All narratives already have embeddings!`);
    return;
  }
  
  let running = true;
  let emptyBatchCount = 0;
  let processedInThisRun = 0;
  
  while (running) {
    try {
      // Get batch of narratives without embeddings
      const batch = await getNarrativesWithoutEmbeddings(progress.lastProcessedCRD, BATCH_SIZE);
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`No more narratives without embeddings found (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 5) {
          log('✅ All narratives now have embeddings');
          running = false;
          break;
        }
        
        // Skip ahead to find more
        const skipAmount = 10000;
        progress.lastProcessedCRD += skipAmount;
        saveProgress(progress);
        log(`⏭️ Skipping ahead by ${skipAmount} to CRD ${progress.lastProcessedCRD}`);
        
        if (progress.lastProcessedCRD > 200000) {
          log('✅ Reached end of CRD range, stopping');
          running = false;
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      emptyBatchCount = 0;
      log(`📦 Processing batch of ${batch.length} narratives`);
      
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
      log(`🧠 New embeddings in this run: ${processedInThisRun}`);
      
      // Get updated embedding count
      const { count: updatedEmbeddingCount, error: updatedError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
        
      const currentEmbeddings = updatedEmbeddingCount || 0;
      const currentRemaining = (totalNarratives || 0) - currentEmbeddings;
      log(`📊 Current embedding status: ${currentEmbeddings} complete, ${currentRemaining} remaining`);
      
      // Delay between batches
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
  
  log('🎉 Corrected embedding generation complete');
  log(`📊 Final progress: ${progress.processed} processed, ${progress.successful} successful, ${progress.failed} failed`);
  log(`🧠 Total new embeddings generated: ${processedInThisRun}`);
}

// Run the main function
main().catch(error => {
  log(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});
