#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function convertAllEmbeddings() {
  console.log('🚀 STARTING AUTOMATED EMBEDDING CONVERSION');
  console.log('=' .repeat(60));
  console.log('This will run in the background and convert all 41,303 embeddings');
  console.log('Estimated time: 10-15 minutes\n');
  
  let totalConverted = 0;
  let remaining = 41303;
  let batchCount = 0;
  let errors = 0;
  let batchSize = 100; // Start with 100, will auto-adjust if needed
  const startTime = Date.now();
  
  // Log file for progress
  const fs = require('fs');
  const logFile = 'embedding_conversion.log';
  
  function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(message);
    fs.appendFileSync(logFile, logMessage + '\n');
  }
  
  log(`Starting conversion of ${remaining} embeddings...`);
  
  while (remaining > 0) {
    batchCount++;
    
    try {
      // Try to convert a batch
      const { data, error } = await supabase.rpc('convert_embeddings_batch', { 
        batch_size: batchSize 
      });
      
      if (error) {
        // If timeout, reduce batch size
        if (error.message.includes('timeout') || error.message.includes('upstream')) {
          batchSize = Math.max(25, Math.floor(batchSize / 2));
          log(`⚠️  Timeout detected, reducing batch size to ${batchSize}`);
          continue;
        } else {
          log(`❌ Error: ${error.message}`);
          errors++;
          if (errors > 10) {
            log('Too many errors, stopping');
            break;
          }
        }
      } else if (data && data[0]) {
        const result = data[0];
        totalConverted += result.converted;
        remaining = result.remaining;
        
        // Progress update every 10 batches or every 1000 conversions
        if (batchCount % 10 === 0 || totalConverted % 1000 === 0) {
          const percent = ((totalConverted / 41303) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
          const rate = (totalConverted / ((Date.now() - startTime) / 1000)).toFixed(1);
          
          log(`📊 Progress: ${totalConverted}/41303 (${percent}%) | Remaining: ${remaining} | Time: ${elapsed}min | Rate: ${rate}/sec`);
        }
        
        // If successful, try increasing batch size again
        if (batchSize < 100 && batchCount % 20 === 0) {
          batchSize = Math.min(100, batchSize + 25);
          log(`📈 Increasing batch size to ${batchSize}`);
        }
      }
      
      // Break if done
      if (remaining === 0) {
        break;
      }
      
      // Wait between batches to avoid overwhelming the database
      // Longer wait for smaller batches, shorter for larger ones
      const waitTime = batchSize >= 100 ? 200 : batchSize >= 50 ? 500 : 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
    } catch (err) {
      log(`❌ Unexpected error: ${err.message}`);
      errors++;
      if (errors > 10) {
        log('Too many errors, stopping');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  log('\n' + '='.repeat(60));
  log('✅ CONVERSION COMPLETE!');
  log(`   Total converted: ${totalConverted}`);
  log(`   Batches run: ${batchCount}`);
  log(`   Total time: ${totalTime} minutes`);
  log(`   Average rate: ${(totalConverted / ((Date.now() - startTime) / 1000)).toFixed(1)} embeddings/sec`);
  log('='.repeat(60));
  
  // Now update the match_narratives function and create index
  log('\n📝 Updating match_narratives function...');
  
  const updateFunctionSQL = `
    CREATE OR REPLACE FUNCTION match_narratives(
      query_embedding vector(768),
      match_threshold float DEFAULT 0.3,
      match_count int DEFAULT 10
    )
    RETURNS TABLE(
      crd_number text,
      similarity float,
      legal_name text,
      narrative text
    ) 
    LANGUAGE sql
    STABLE
    AS $$
      SELECT 
        n.crd_number::text,
        1 - (n.embedding_vector <=> query_embedding) as similarity,
        n.legal_name,
        n.narrative
      FROM narratives n
      WHERE n.embedding_vector IS NOT NULL
        AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
      ORDER BY n.embedding_vector <=> query_embedding
      LIMIT match_count;
    $$;
  `;
  
  // We can't run raw SQL through RPC, so we'll need to do this manually
  log('⚠️  Please run the following in Supabase SQL Editor to complete setup:');
  log('1. Update the match_narratives function (see generated SQL file)');
  log('2. Create HNSW index: CREATE INDEX narratives_embedding_vector_hnsw_idx ON narratives USING hnsw (embedding_vector vector_cosine_ops) WITH (m = 16, ef_construction = 200);');
  
  // Save the SQL for manual execution
  fs.writeFileSync('complete_setup.sql', `
-- Run this after conversion is complete
${updateFunctionSQL}

-- Create HNSW index
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Analyze table
ANALYZE narratives;

-- Test semantic search
SELECT COUNT(*) as ready_embeddings 
FROM narratives 
WHERE embedding_vector IS NOT NULL;
  `);
  
  log('\n✅ SQL file created: complete_setup.sql');
  log('📋 Check embedding_conversion.log for full details');
  
  // Test if semantic search works
  log('\n🧪 Testing semantic search...');
  const testEmbedding = new Array(768).fill(0.01);
  const { data: testResults, error: testError } = await supabase.rpc('match_narratives', {
    query_embedding: testEmbedding,
    match_threshold: 0.0,
    match_count: 5
  });
  
  if (testError) {
    log(`⚠️  Search test failed: ${testError.message}`);
    log('Run the SQL in complete_setup.sql to finish setup');
  } else if (testResults && testResults.length > 0) {
    log(`✅ SEMANTIC SEARCH IS WORKING! Found ${testResults.length} matches`);
  }
  
  process.exit(0);
}

// Run it
convertAllEmbeddings().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
