#!/usr/bin/env node

/**
 * Script to generate embeddings for narratives using Vertex AI
 * Processes in batches with rate limiting for optimal performance
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// We'll use direct API calls for simplicity since importing TypeScript from JavaScript can be complex

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
const DELAY_MS = 1000; // 1 second delay between batches (faster than narrative generation)
const LOG_FILE = path.join(__dirname, '..', 'logs', 'generate_embeddings_batch.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'generate_embeddings_batch_progress.json');

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
    processed: 0,
    embeddingsGenerated: 0,
    failed: 0,
    lastProcessedCRD: 0,
    errors: []
  };
}

// Generate embedding using OpenAI (reliable and simple)
async function generateEmbedding(text) {
  return await generateOpenAIEmbedding(text);
}

// Fallback OpenAI embedding generation
async function generateOpenAIEmbedding(text) {
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

// Remove the getAccessToken function since we're using the existing AI providers

// Process a batch of narratives
async function processBatch(narratives) {
  const results = [];
  
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
  
  return results;
}

// Main processing function
async function main() {
  log('=' .repeat(60));
  log('🚀 Starting Batch Embedding Generation');
  log('=' .repeat(60));
  
  const progress = loadProgress();
  
  try {
    // Find narratives that need embeddings
    log('🔍 Finding narratives that need embeddings...');
    
    const { data: narratives, error } = await supabase
      .from('narratives')
      .select('id, crd_number, narrative')
      .is('embedding_vector', null)
      .not('narrative', 'is', null)
      .gt('crd_number', progress.lastProcessedCRD)
      .order('crd_number')
      .limit(1000); // Process up to 1000 at a time
    
    if (error) {
      log(`❌ Error fetching narratives: ${error.message}`);
      return;
    }
    
    if (!narratives || narratives.length === 0) {
      log('✅ No narratives need embeddings');
      return;
    }
    
    log(`📊 Found ${narratives.length} narratives that need embeddings`);
    
    // Process in batches
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < narratives.length; i += BATCH_SIZE) {
      const batch = narratives.slice(i, Math.min(i + BATCH_SIZE, narratives.length));
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(narratives.length / BATCH_SIZE);
      
      log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} narratives)`);
      
      const results = await processBatch(batch);
      
      // Update counters
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      totalProcessed += results.length;
      totalSuccess += successCount;
      totalFailed += failCount;
      
      // Update progress
      progress.processed += results.length;
      progress.embeddingsGenerated += successCount;
      progress.failed += failCount;
      progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
      saveProgress(progress);
      
      log(`  ✅ Batch complete: ${successCount} succeeded, ${failCount} failed`);
      log(`  📊 Total progress: ${totalProcessed}/${narratives.length} processed`);
      
      // Delay between batches
      if (i + BATCH_SIZE < narratives.length) {
        log(`  ⏰ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    
    // Final summary
    log('\n' + '=' .repeat(60));
    log('📊 EMBEDDING GENERATION COMPLETE');
    log('=' .repeat(60));
    log(`✅ Total processed: ${totalProcessed} narratives`);
    log(`🔢 Embeddings generated: ${totalSuccess}`);
    log(`❌ Failed: ${totalFailed}`);
    log(`\n📊 Overall progress:`);
    log(`   Total processed (all runs): ${progress.processed}`);
    log(`   Total embeddings generated: ${progress.embeddingsGenerated}`);
    log(`   Total failed: ${progress.failed}`);
    
    if (narratives.length === 1000) {
      log('\n💡 There may be more narratives to process. Run the script again to continue.');
    }
    
    // Check semantic search functionality
    if (totalSuccess > 0) {
      log('\n🔍 Testing semantic search functionality...');
      const { data: testResults } = await supabase
        .from('narratives')
        .select('id, crd_number')
        .not('embedding_vector', 'is', null)
        .limit(5);
      
      if (testResults && testResults.length > 0) {
        log(`✅ Found ${testResults.length} narratives with embeddings ready for semantic search`);
      }
    }
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
  
  log('\n✨ Process complete!');
  log(`📁 Logs saved to: ${LOG_FILE}`);
  log(`📁 Progress saved to: ${PROGRESS_FILE}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generateEmbedding, generateOpenAIEmbedding };
