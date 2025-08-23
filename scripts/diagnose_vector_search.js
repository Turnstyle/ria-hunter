/**
 * Vector Search Diagnostic Tool
 * Comprehensive analysis of vector search performance and functionality
 */

const { createClient } = require('@supabase/supabase-js')
const { validateEnvVars } = require('./load-env')

// Load and validate environment variables
const { supabaseUrl, supabaseServiceKey } = validateEnvVars()
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function diagnoseVectorSearch() {
  console.log('🔬 VECTOR SEARCH DIAGNOSTIC')
  console.log('='.repeat(60))
  
  try {
    // Step 1: Check basic narrative data
    console.log('\n📊 Step 1: Basic Data Analysis')
    
    const { count: totalNarratives } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const { count: narrativesWithVectors } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding_vector', 'is', null)
    
    console.log(`   Total narratives: ${totalNarratives?.toLocaleString()}`)
    console.log(`   With vectors: ${narrativesWithVectors?.toLocaleString()}`)
    console.log(`   Coverage: ${((narrativesWithVectors / totalNarratives) * 100).toFixed(1)}%`)
    
    // Step 2: Sample actual embedding data
    console.log('\n🔍 Step 2: Sample Embedding Analysis')
    
    const { data: sampleNarrative, error: sampleError } = await supabase
      .from('narratives')
      .select('id, narrative, embedding_vector')
      .not('embedding_vector', 'is', null)
      .limit(1)
      .single()
    
    if (sampleError) {
      console.log('❌ Error fetching sample:', sampleError.message)
      return
    }
    
    console.log(`   Sample ID: ${sampleNarrative.id}`)
    console.log(`   Narrative length: ${sampleNarrative.narrative?.length || 'N/A'} chars`)
    
    // Check embedding format
    let sampleEmbedding = null
    try {
      if (typeof sampleNarrative.embedding_vector === 'string') {
        sampleEmbedding = JSON.parse(sampleNarrative.embedding_vector)
        console.log(`   Embedding format: JSON string`)
      } else if (Array.isArray(sampleNarrative.embedding_vector)) {
        sampleEmbedding = sampleNarrative.embedding_vector
        console.log(`   Embedding format: Direct array`)
      } else {
        console.log(`   Embedding format: ${typeof sampleNarrative.embedding_vector}`)
      }
      
      if (sampleEmbedding && Array.isArray(sampleEmbedding)) {
        console.log(`   Embedding dimensions: ${sampleEmbedding.length}`)
        console.log(`   First few values: [${sampleEmbedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`)
      }
    } catch (e) {
      console.log(`   ❌ Error parsing embedding: ${e.message}`)
    }
    
    // Step 3: Test direct vector similarity (without function)
    console.log('\n⚡ Step 3: Direct Vector Similarity Test')
    
    if (sampleEmbedding) {
      const startTime = Date.now()
      
      // Use the sample embedding to search for similar records
      const { data: directResults, error: directError } = await supabase
        .from('narratives')
        .select('id, narrative, embedding_vector')
        .not('embedding_vector', 'is', null)
        .limit(5)
      
      const endTime = Date.now()
      
      if (directError) {
        console.log('❌ Direct query error:', directError.message)
      } else {
        console.log(`   ✅ Direct query: ${endTime - startTime}ms`)
        console.log(`   Results found: ${directResults?.length || 0}`)
      }
    }
    
    // Step 4: Test match_narratives function with very low threshold
    console.log('\n🎯 Step 4: Function Test with Low Threshold')
    
    if (sampleEmbedding) {
      const testRuns = [
        { threshold: 0.0, label: 'No threshold' },
        { threshold: 0.1, label: 'Very low' },
        { threshold: 0.5, label: 'Medium' },
        { threshold: 0.8, label: 'High' }
      ]
      
      for (const test of testRuns) {
        const startTime = Date.now()
        
        const { data: results, error } = await supabase.rpc('match_narratives', {
          query_embedding: sampleEmbedding,
          match_threshold: test.threshold,
          match_count: 5
        })
        
        const endTime = Date.now()
        const queryTime = endTime - startTime
        
        if (error) {
          console.log(`   ❌ ${test.label} (${test.threshold}): ${error.message}`)
        } else {
          console.log(`   ${results?.length > 0 ? '✅' : '⚠️'} ${test.label} (${test.threshold}): ${queryTime}ms, ${results?.length || 0} results`)
          
          if (results && results.length > 0) {
            const topResult = results[0]
            console.log(`      Top match: similarity ${topResult.similarity_score?.toFixed(4) || 'N/A'}`)
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)) // Brief pause
      }
    }
    
    // Step 5: Check indexes
    console.log('\n📋 Step 5: Index Analysis')
    
    const { data: indexData, error: indexError } = await supabase
      .from('pg_stat_user_indexes')
      .select('indexrelname, idx_scan, idx_tup_read, idx_tup_fetch')
      .ilike('indexrelname', '%narratives%embedding%')
    
    if (indexError) {
      console.log('❌ Index query error:', indexError.message)
    } else if (!indexData || indexData.length === 0) {
      console.log('⚠️ No embedding indexes found in pg_stat_user_indexes')
    } else {
      console.log('📊 Index usage statistics:')
      indexData.forEach(idx => {
        console.log(`   ${idx.indexrelname}: ${idx.idx_scan} scans, ${idx.idx_tup_read} reads`)
      })
    }
    
    // Final assessment
    console.log('\n' + '='.repeat(60))
    console.log('📋 DIAGNOSTIC SUMMARY')
    
    if (narrativesWithVectors === 0) {
      console.log('❌ CRITICAL: No narratives have embedding vectors!')
    } else if (!sampleEmbedding) {
      console.log('❌ CRITICAL: Cannot parse embedding format!')
    } else {
      console.log('✅ Embeddings exist and are parseable')
      console.log('🔍 Issue might be with similarity thresholds or function logic')
    }
    
  } catch (error) {
    console.error('💥 Diagnostic failed:', error.message)
  }
}

diagnoseVectorSearch()
