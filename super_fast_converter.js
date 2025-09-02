#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function superFastConverter() {
  console.log('⚡ SUPER FAST CONVERTER - Batch Size 1');
  console.log('=' .repeat(50));
  console.log('Using batch size 1 with minimal delays');
  console.log('Estimated time: 5-8 minutes for 41,251 remaining\n');
  
  let totalConverted = 0;
  let remaining = 41251;
  let errors = 0;
  const startTime = Date.now();
  let lastUpdate = startTime;
  
  const fs = require('fs');
  const logFile = 'fast_conversion.log';
  
  function log(message) {
    const timestamp = new Date().toISOString();
    console.log(message);
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  }
  
  log(`Starting fast conversion of ${remaining} embeddings...`);
  
  // Use Promise.all to run multiple conversions in parallel
  const PARALLEL_BATCHES = 5; // Run 5 batch-size-1 operations in parallel
  
  while (remaining > 0) {
    const startBatch = Date.now();
    
    // Create array of parallel conversion promises
    const promises = [];
    for (let i = 0; i < Math.min(PARALLEL_BATCHES, remaining); i++) {
      promises.push(
        supabase.rpc('convert_embeddings_batch', { batch_size: 1 })
          .then(({ data, error }) => ({ data, error, success: !error }))
          .catch(err => ({ error: err, success: false }))
      );
    }
    
    // Wait for all parallel operations to complete
    const results = await Promise.all(promises);
    
    // Process results
    let batchConverted = 0;
    let batchErrors = 0;
    
    results.forEach(result => {
      if (result.success && result.data && result.data[0]) {
        batchConverted += result.data[0].converted;
        remaining = result.data[0].remaining; // Update remaining from last result
      } else {
        batchErrors++;
        if (result.error) {
          log(`❌ Error: ${result.error.message}`);
        }
      }
    });
    
    totalConverted += batchConverted;
    errors += batchErrors;
    
    // Progress update every 100 conversions or 30 seconds
    const now = Date.now();
    if (totalConverted % 100 === 0 || (now - lastUpdate) > 30000) {
      const elapsed = (now - startTime) / 1000 / 60;
      const rate = totalConverted / ((now - startTime) / 1000);
      const eta = remaining / rate / 60;
      const percent = ((totalConverted / 41251) * 100).toFixed(1);
      
      log(`📊 ${totalConverted}/41251 (${percent}%) | Remaining: ${remaining} | Rate: ${rate.toFixed(1)}/sec | ETA: ${eta.toFixed(1)}min`);
      lastUpdate = now;
    }
    
    // Break if done
    if (remaining === 0) break;
    
    // Very short delay between parallel batches (50ms)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Stop if too many errors
    if (errors > 50) {
      log(`❌ Too many errors (${errors}), stopping`);
      break;
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000 / 60;
  const finalRate = totalConverted / ((Date.now() - startTime) / 1000);
  
  log('\n' + '='.repeat(50));
  log('✅ CONVERSION COMPLETE!');
  log(`   Converted: ${totalConverted}`);
  log(`   Remaining: ${remaining}`);
  log(`   Errors: ${errors}`);
  log(`   Time: ${totalTime.toFixed(1)} minutes`);
  log(`   Average rate: ${finalRate.toFixed(1)} conversions/sec`);
  log('='.repeat(50));
  
  if (remaining === 0) {
    log('\n🎉 ALL EMBEDDINGS CONVERTED!');
    log('Next: Run complete_setup.sql to finish the semantic search setup');
    
    // Create the final setup SQL
    const setupSQL = `
-- FINAL SETUP - Run this to complete semantic search
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
LANGUAGE sql STABLE AS $$
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

-- Create HNSW index for fast search
DROP INDEX IF EXISTS narratives_embedding_vector_hnsw_idx;
CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Analyze for query planner
ANALYZE narratives;

-- Test it works
SELECT COUNT(*) as total_vectors FROM narratives WHERE embedding_vector IS NOT NULL;

-- Clean up tracking column
ALTER TABLE narratives DROP COLUMN IF EXISTS embedding_converted;
    `;
    
    fs.writeFileSync('final_setup.sql', setupSQL);
    log('📝 Created final_setup.sql - run this to complete setup');
  }
}

// Run it
superFastConverter().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
