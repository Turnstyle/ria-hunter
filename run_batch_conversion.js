const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runBatchConversion() {
  console.log('🚀 Starting batch conversion of embeddings...\n')
  
  let totalConverted = 0
  let remaining = 41303 // approximate starting count
  let iteration = 0
  
  // First, ensure the function exists
  console.log('Setting up conversion function...')
  const { error: setupError } = await supabase.rpc('convert_embeddings_batch', { batch_size: 1 })
  
  if (setupError && setupError.message.includes('does not exist')) {
    console.log('❌ Conversion function not found!')
    console.log('Please run the SQL setup script first in Supabase SQL Editor')
    return
  }
  
  console.log('Starting conversion loop...\n')
  
  while (remaining > 0) {
    iteration++
    
    // Run batch conversion
    const { data, error } = await supabase.rpc('convert_embeddings_batch', { 
      batch_size: 500 
    })
    
    if (error) {
      console.log(`❌ Error in iteration ${iteration}:`, error.message)
      break
    }
    
    if (data && data.length > 0) {
      const result = data[0]
      totalConverted += result.converted
      remaining = result.remaining
      
      const percent = ((totalConverted / 41303) * 100).toFixed(1)
      console.log(`Iteration ${iteration}: Converted ${result.converted} | Total: ${totalConverted} | Remaining: ${remaining} | Progress: ${percent}%`)
      
      if (result.errors > 0) {
        console.log(`  ⚠️  ${result.errors} errors in this batch`)
      }
    }
    
    // Small delay to be nice to the database
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log('\n' + '='.repeat(50))
  console.log(`✅ CONVERSION COMPLETE!`)
  console.log(`   Total converted: ${totalConverted}`)
  console.log(`   Iterations: ${iteration}`)
  console.log('='.repeat(50))
  
  // Test semantic search
  console.log('\nTesting semantic search...')
  const testEmbedding = new Array(768).fill(0.01)
  
  const { data: matches, error: matchError } = await supabase.rpc('match_narratives', {
    query_embedding: testEmbedding,
    match_threshold: 0.0,
    match_count: 5
  })
  
  if (matchError) {
    console.log('❌ Search test failed:', matchError.message)
  } else if (matches && matches.length > 0) {
    console.log(`✅ SEMANTIC SEARCH WORKING! Found ${matches.length} matches`)
    console.log(`   Top match: ${matches[0].legal_name} (${matches[0].crd_number})`)
    console.log(`   Similarity: ${(matches[0].similarity * 100).toFixed(1)}%`)
  } else {
    console.log('⚠️  No matches found - may need to update match_narratives function')
  }
}

runBatchConversion().catch(console.error)
