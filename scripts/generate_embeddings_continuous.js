#!/usr/bin/env node

/**
 * Continuous Embedding Generation Script
 * Processes ALL remaining narratives until completion
 * No 1000-narrative limit - runs until everything is done
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 20; // Process 20 at a time
const DELAY_MS = 1000; // 1 second delay between batches
const CHUNK_SIZE = 1000; // How many to fetch at once from DB
const LOG_FILE = path.join(__dirname, '..', 'logs', 'generate_embeddings_continuous.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'generate_embeddings_continuous_progress.json');

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logging utility
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Progress management
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    totalProcessed: 0,
    totalEmbeddingsGenerated: 0,
    totalFailed: 0,
    lastProcessedCRD: 0,
    errors: [],
    startTime: new Date().toISOString()
  };
}

// Generate embedding using OpenAI
async function generateEmbedding(text) {
  try {
    const openAIKey = process.env.OPENAI_API_KEY;
    if (!openAIKey) {
      throw new Error('OpenAI API key not found');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
        dimensions: 768  // Match Vertex AI's 768 dimensions
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    log(`  ❌ OpenAI embedding error: ${error.message}`);
    return null;
  }
}

// Process a batch of narratives
async function processBatch(narratives, batchNum, totalBatches) {
  const results = [];
  
  log(`📦 Processing batch ${batchNum}/${totalBatches} (${narratives.length} narratives)`);
  
  for (const narrative of narratives) {
    try {
      log(`  Processing narrative ID ${narrative.id} (CRD ${narrative.crd_number})`);
      
      // Generate embedding
      const embedding = await generateEmbedding(narrative.narrative);
      
      if (!embedding) {
        log(`    ❌ Failed to generate embedding`);
        results.push({ id: narrative.id, success: false });
        continue;
      }
      
      // Update the narrative with the embedding
      const { error } = await supabase
        .from('narratives')
        .update({
          embedding_vector: embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', narrative.id);
      
      if (error) {
        log(`    ❌ Database error: ${error.message}`);
        results.push({ id: narrative.id, success: false });
      } else {
        log(`    ✅ Successfully generated embedding (${embedding.length} dimensions)`);
        results.push({ id: narrative.id, success: true });
      }
      
    } catch (error) {
      log(`    ❌ Error processing narrative ${narrative.id}: ${error.message}`);
      results.push({ id: narrative.id, success: false });
    }
  }
  
  // Update counters
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  log(`  ✅ Batch complete: ${successCount} succeeded, ${failCount} failed`);
  
  return results;
}

// Get total count of narratives needing embeddings
async function getTotalNarrativesCount() {
  const { count, error } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .is('embedding_vector', null)
    .not('narrative', 'is', null);
    
  if (error) {
    log(`❌ Error getting total count: ${error.message}`);
    return 0;
  }
  
  return count || 0;
}

// Main continuous processing function
async function main() {
  log('=' .repeat(80));
  log('🚀 Starting CONTINUOUS Embedding Generation');
  log('🔄 Will process ALL remaining narratives until complete');
  log('=' .repeat(80));
  
  const progress = loadProgress();
  const totalNarratives = await getTotalNarrativesCount();
  
  log(`📊 Found ${totalNarratives} narratives that need embeddings`);
  log(`📈 Starting from CRD ${progress.lastProcessedCRD}`);
  
  if (totalNarratives === 0) {
    log('✅ All narratives already have embeddings! Nothing to process.');
    return;
  }
  
  let totalProcessedThisRun = 0;
  let totalSuccessThisRun = 0;
  let totalFailedThisRun = 0;
  let continuousProcessing = true;
  
  while (continuousProcessing) {
    try {
      log(`\n🔍 Fetching next batch of narratives (starting from CRD ${progress.lastProcessedCRD})`);
      
      // Fetch next chunk of narratives
      const { data: narratives, error } = await supabase
        .from('narratives')
        .select('id, crd_number, narrative')
        .is('embedding_vector', null)
        .not('narrative', 'is', null)
        .gt('crd_number', progress.lastProcessedCRD)
        .order('crd_number')
        .limit(CHUNK_SIZE);
      
      if (error) {
        log(`❌ Error fetching narratives: ${error.message}`);
        break;
      }
      
      if (!narratives || narratives.length === 0) {
        log('🎉 No more narratives found! All embeddings complete!');
        continuousProcessing = false;
        break;
      }
      
      log(`📦 Processing chunk of ${narratives.length} narratives`);
      
      // Process this chunk in batches
      for (let i = 0; i < narratives.length; i += BATCH_SIZE) {
        const batch = narratives.slice(i, Math.min(i + BATCH_SIZE, narratives.length));
        const batchNum = Math.floor((totalProcessedThisRun + i) / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalNarratives / BATCH_SIZE);
        
        const results = await processBatch(batch, batchNum, totalBatches);
        
        // Update counters
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        totalProcessedThisRun += results.length;
        totalSuccessThisRun += successCount;
        totalFailedThisRun += failCount;
        
        // Update global progress
        progress.totalProcessed += results.length;
        progress.totalEmbeddingsGenerated += successCount;
        progress.totalFailed += failCount;
        progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
        saveProgress(progress);
        
        const remainingApprox = totalNarratives - totalProcessedThisRun;
        log(`  📊 Progress: ${totalProcessedThisRun} processed this run, ~${remainingApprox} remaining`);
        log(`  🎯 Overall: ${progress.totalProcessed} total processed, ${progress.totalEmbeddingsGenerated} embeddings generated`);
        
        // Delay between batches (except for last batch in chunk)
        if (i + BATCH_SIZE < narratives.length) {
          log(`  ⏰ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }
      
      // Small delay between chunks
      if (narratives.length === CHUNK_SIZE) {
        log(`⏰ Completed chunk. Brief pause before fetching next chunk...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      log(`❌ Error in main loop: ${error.message}`);
      console.error(error);
      // Don't exit, just continue with next iteration
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Final summary
  const endTime = new Date();
  const startTime = new Date(progress.startTime);
  const durationMs = endTime - startTime;
  const durationMinutes = Math.round(durationMs / (1000 * 60));
  
  log('\n' + '=' .repeat(80));
  log('🎉 CONTINUOUS EMBEDDING GENERATION COMPLETE!');
  log('=' .repeat(80));
  log(`✅ Processed this run: ${totalProcessedThisRun} narratives`);
  log(`🔢 Generated this run: ${totalSuccessThisRun} embeddings`);
  log(`❌ Failed this run: ${totalFailedThisRun}`);
  log(`⏰ Duration: ${durationMinutes} minutes`);
  log(`\n📊 FINAL TOTALS:`);
  log(`   🎯 Total processed (all runs): ${progress.totalProcessed}`);
  log(`   ✅ Total embeddings generated: ${progress.totalEmbeddingsGenerated}`);
  log(`   ❌ Total failed: ${progress.totalFailed}`);
  
  // Final verification
  log('\n🔍 Final verification...');
  const remainingCount = await getTotalNarrativesCount();
  if (remainingCount === 0) {
    log('🎉 PERFECT! All narratives now have embeddings!');
    log('🚀 Semantic search is fully ready with complete coverage!');
  } else {
    log(`⚠️  ${remainingCount} narratives still need embeddings (may need to run again)`);
  }
  
  log(`\n📁 Logs saved to: ${LOG_FILE}`);
  log(`📁 Progress saved to: ${PROGRESS_FILE}`);
  log('\n✨ Process complete!');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n🛑 Received interrupt signal. Saving progress and exiting...');
  log('✅ Progress saved. You can restart the script to continue from where it left off.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n🛑 Received termination signal. Saving progress and exiting...');
  log('✅ Progress saved. You can restart the script to continue from where it left off.');
  process.exit(0);
});

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generateEmbedding };
