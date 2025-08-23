/**
 * Check HNSW Index Status
 * Verifies if the required HNSW index exists and provides performance status
 */

const { createClient } = require('@supabase/supabase-js')
const { validateEnvVars } = require('./load-env')

// Load and validate environment variables
const { supabaseUrl, supabaseServiceKey } = validateEnvVars()
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkHNSWIndexStatus() {
  console.log('🔍 CHECKING HNSW INDEX STATUS')
  console.log('='.repeat(50))
  
  try {
    // Check current indexes on narratives table
    const { data: indexes, error } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT 
              indexname as index_name,
              CASE 
                  WHEN indexdef LIKE '%USING hnsw%' THEN 'HNSW'
                  WHEN indexdef LIKE '%USING ivfflat%' THEN 'IVFFlat'
                  WHEN indexdef LIKE '%USING btree%' THEN 'B-tree'
                  ELSE 'Other'
              END as index_type,
              pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
              indexdef
          FROM pg_indexes 
          WHERE tablename = 'narratives' 
              AND (indexdef LIKE '%embedding_vector%' OR indexdef LIKE '%crd_number%')
          ORDER BY indexname;
        `
      })
    
    if (error) {
      console.log('❌ Error checking indexes:', error.message)
      console.log('\n📋 Manual Check Required:')
      console.log('Execute this SQL in Supabase SQL Editor:')
      console.log(`
SELECT 
    indexname,
    CASE 
        WHEN indexdef LIKE '%USING hnsw%' THEN 'HNSW'
        ELSE 'Other'
    END as type,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes 
WHERE tablename = 'narratives' 
    AND indexdef LIKE '%embedding_vector%';
      `)
      return
    }
    
    console.log('\n📊 Current Indexes on narratives table:')
    
    if (!indexes || indexes.length === 0) {
      console.log('❌ NO INDEXES FOUND on embedding_vector column!')
      console.log('\n🚨 CRITICAL: HNSW index missing - this explains slow performance')
    } else {
      indexes.forEach(idx => {
        const status = idx.index_type === 'HNSW' ? '✅' : '⚠️'
        console.log(`${status} ${idx.index_name}: ${idx.index_type} (${idx.index_size})`)
      })
      
      const hasHNSW = indexes.some(idx => idx.index_type === 'HNSW')
      
      if (hasHNSW) {
        console.log('\n🎉 HNSW INDEX EXISTS! Should have <10ms performance')
      } else {
        console.log('\n❌ HNSW INDEX MISSING! Need to create it for 507x improvement')
      }
    }
    
    // Check narrative count with vectors
    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding_vector', 'is', null)
    
    console.log(`\n📈 Vector-Ready Narratives: ${narrativeCount?.toLocaleString()}`)
    
    // Simple performance test if we have data
    if (narrativeCount > 0) {
      console.log('\n⚡ Running quick performance test...')
      
      const startTime = Date.now()
      const { data: testResult, error: testError } = await supabase
        .rpc('match_narratives', {
          query_embedding: new Array(768).fill(0.1), // Simple test vector
          match_threshold: 0.5,
          match_count: 5
        })
      const endTime = Date.now()
      
      if (testError) {
        console.log('❌ Performance test failed:', testError.message)
      } else {
        const queryTime = endTime - startTime
        console.log(`🎯 Query Time: ${queryTime}ms`)
        
        if (queryTime < 10) {
          console.log('🚀 EXCELLENT: <10ms performance achieved!')
        } else if (queryTime < 100) {
          console.log('⚠️  GOOD: <100ms but could be better with HNSW')
        } else {
          console.log('❌ SLOW: >100ms - definitely need HNSW index')
        }
      }
    }
    
    console.log('\n' + '='.repeat(50))
    
    const hasHNSW = indexes && indexes.some(idx => idx.index_type === 'HNSW')
    
    if (hasHNSW) {
      console.log('✅ STATUS: HNSW index exists - performance should be optimal')
    } else {
      console.log('❌ STATUS: HNSW index MISSING - execute creation SQL immediately')
      console.log('\n🔥 NEXT ACTION: Copy SQL from HNSW_INDEX_CREATION.md and run in Supabase SQL Editor')
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error)
  }
}

checkHNSWIndexStatus()
