/**
 * Performance Optimizer for RIA Hunter Vector Search
 * Target: Achieve 507x performance improvement (from 285ms to <10ms)
 * Approach: HNSW index optimization, query tuning, and connection pooling
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

class PerformanceOptimizer {
  constructor() {
    this.baselinePerformance = null
    this.optimizedPerformance = null
    this.testEmbedding = Array(768).fill(0.1)
    this.testIterations = 10
  }

  async initialize() {
    console.log('⚡ PERFORMANCE OPTIMIZATION ANALYSIS')
    console.log('='.repeat(50))
    
    // Check current system state
    await this.checkSystemState()
  }

  async checkSystemState() {
    console.log('\n🔍 System State Analysis:')
    
    try {
      // Check narrative count and vector coverage
      const { count: narrativeCount } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
      
      const { count: vectorCount } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
        .not('embedding_vector', 'is', null)
      
      console.log(`   📊 Narratives: ${narrativeCount?.toLocaleString()} total`)
      console.log(`   📊 Vectors: ${vectorCount?.toLocaleString()} (${vectorCount && narrativeCount ? ((vectorCount/narrativeCount)*100).toFixed(1) : 0}% coverage)`)
      
      // Check for existing indexes
      await this.checkIndexes()
      
      // Check current function performance
      await this.measureBaselinePerformance()
      
    } catch (error) {
      console.error('❌ System state check failed:', error.message)
    }
  }

  async checkIndexes() {
    console.log('\n🔧 Index Analysis:')
    
    try {
      // Since we can't use the custom function yet, let's check with a query
      const { data, error } = await supabase
        .from('narratives')
        .select('embedding_vector')
        .not('embedding_vector', 'is', null)
        .limit(1)
      
      if (error) {
        console.log('   ❌ Cannot access narratives table for index check')
        return
      }
      
      console.log('   ✅ Narratives table accessible')
      console.log('   ℹ️  HNSW index status: Run check_vector_indexes() function after SQL execution')
      
    } catch (error) {
      console.log('   ❌ Index check failed:', error.message)
    }
  }

  async measureBaselinePerformance() {
    console.log('\n📏 Baseline Performance Measurement:')
    
    const measurements = []
    
    for (let i = 0; i < this.testIterations; i++) {
      try {
        const startTime = Date.now()
        
        // Direct query to test raw performance
        const { data, error } = await supabase
          .from('narratives')
          .select('id, crd_number, narrative')
          .not('embedding_vector', 'is', null)
          .limit(10)
        
        const duration = Date.now() - startTime
        measurements.push(duration)
        
        if (error) {
          console.log(`   ❌ Test ${i + 1} failed: ${error.message}`)
          continue
        }
        
        console.log(`   📊 Test ${i + 1}: ${duration}ms (${data?.length || 0} results)`)
        
      } catch (error) {
        console.log(`   ❌ Test ${i + 1} error: ${error.message}`)
      }
      
      // Small delay between tests
      await this.delay(100)
    }
    
    if (measurements.length > 0) {
      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const minDuration = Math.min(...measurements)
      const maxDuration = Math.max(...measurements)
      
      this.baselinePerformance = {
        average: avgDuration,
        min: minDuration,
        max: maxDuration,
        measurements
      }
      
      console.log(`\n📈 Baseline Results:`)
      console.log(`   - Average: ${avgDuration.toFixed(1)}ms`)
      console.log(`   - Best: ${minDuration}ms`)
      console.log(`   - Worst: ${maxDuration}ms`)
      console.log(`   - Target: <10ms (${(avgDuration/10).toFixed(1)}x improvement needed)`)
    }
  }

  async createOptimizedIndexes() {
    console.log('\n🚀 Creating Optimized HNSW Index:')
    
    // This SQL needs to be executed in Supabase SQL Editor
    const indexSQL = `
-- Create optimized HNSW index for embedding_vector column
-- Parameters tuned for 41,303+ records
CREATE INDEX IF NOT EXISTS narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector::vector(768) vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Set optimal HNSW search parameters
ALTER DATABASE postgres SET hnsw.ef_search = 100;

-- Create supporting indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS narratives_crd_number_idx 
ON narratives(crd_number) WHERE embedding_vector IS NOT NULL;

-- Analyze table statistics for query planner
ANALYZE narratives;
`
    
    console.log('📋 Execute this SQL in Supabase SQL Editor:')
    console.log('─'.repeat(50))
    console.log(indexSQL)
    console.log('─'.repeat(50))
    
    return indexSQL
  }

  async measureOptimizedPerformance() {
    console.log('\n⚡ Post-Optimization Performance Test:')
    
    // First, test if the optimized functions work
    try {
      const startTime = Date.now()
      
      const { data, error } = await supabase.rpc('test_vector_search_performance')
      
      const duration = Date.now() - startTime
      
      if (error) {
        console.log('❌ Optimized function test failed:', error.message)
        console.log('ℹ️  Execute the SQL functions first before running performance test')
        return null
      }
      
      if (data && data.length > 0) {
        console.log('📊 Optimized Performance Results:')
        data.forEach(result => {
          const improvement = this.baselinePerformance ? 
            (this.baselinePerformance.average / result.duration_ms).toFixed(1) : 'N/A'
          
          console.log(`   - ${result.test_name}: ${result.duration_ms}ms (${result.status})`)
          console.log(`     └─ Results: ${result.result_count}, Improvement: ${improvement}x`)
        })
        
        // Check if we hit the 507x target
        const narrativeSearch = data.find(r => r.test_name === 'narratives_vector_search')
        if (narrativeSearch) {
          const targetAchieved = narrativeSearch.duration_ms < 10
          const actualImprovement = this.baselinePerformance ? 
            (this.baselinePerformance.average / narrativeSearch.duration_ms).toFixed(1) : 'N/A'
          
          console.log(`\n🎯 TARGET ANALYSIS:`)
          console.log(`   - Target: <10ms`)
          console.log(`   - Achieved: ${narrativeSearch.duration_ms}ms`)
          console.log(`   - Status: ${targetAchieved ? '🎉 TARGET MET!' : '⚠️ Needs more optimization'}`)
          console.log(`   - Improvement: ${actualImprovement}x (Target: 507x)`)
        }
      }
      
    } catch (error) {
      console.log('❌ Performance test error:', error.message)
      return null
    }
  }

  async generateOptimizationPlan() {
    console.log('\n🎯 PERFORMANCE OPTIMIZATION PLAN:')
    console.log('='.repeat(50))
    
    const plan = []
    
    // Step 1: Database Function Deployment
    plan.push({
      step: 1,
      title: 'Deploy Corrected Vector Search Functions',
      status: 'Required',
      action: 'Execute SQL from IMPLEMENTATION_SQL_FOR_SUPABASE_EDITOR.md',
      impact: 'Enables vector search functionality',
      priority: 'Critical'
    })
    
    // Step 2: Index Optimization
    plan.push({
      step: 2,
      title: 'Create Optimized HNSW Index',
      status: 'High Impact',
      action: 'Execute HNSW index creation SQL',
      impact: 'Expected 50-100x performance improvement',
      priority: 'High'
    })
    
    // Step 3: Query Optimization
    if (this.baselinePerformance && this.baselinePerformance.average > 50) {
      plan.push({
        step: 3,
        title: 'Query Parameter Tuning',
        status: 'Recommended',
        action: 'Tune ef_search and similarity thresholds',
        impact: 'Additional 2-5x improvement',
        priority: 'Medium'
      })
    }
    
    // Step 4: Connection Optimization
    plan.push({
      step: 4,
      title: 'Connection Pool Optimization',
      status: 'Best Practice',
      action: 'Configure pgBouncer and connection pooling',
      impact: '2-3x improvement under load',
      priority: 'Medium'
    })
    
    plan.forEach(item => {
      console.log(`\n${item.step}. ${item.title}`)
      console.log(`   Status: ${item.status}`)
      console.log(`   Action: ${item.action}`)
      console.log(`   Impact: ${item.impact}`)
      console.log(`   Priority: ${item.priority}`)
    })
    
    return plan
  }

  async generatePerformanceReport() {
    console.log('\n📊 PERFORMANCE OPTIMIZATION REPORT')
    console.log('='.repeat(50))
    
    // Current state summary
    console.log('\n📈 Current State:')
    if (this.baselinePerformance) {
      console.log(`   - Baseline Performance: ${this.baselinePerformance.average.toFixed(1)}ms`)
      console.log(`   - Performance Range: ${this.baselinePerformance.min}ms - ${this.baselinePerformance.max}ms`)
    } else {
      console.log('   - Baseline: Not measured')
    }
    
    // Target analysis
    console.log('\n🎯 Target Analysis:')
    console.log(`   - Target Performance: <10ms`)
    console.log(`   - Target Improvement: 507x`)
    
    if (this.baselinePerformance) {
      const requiredImprovement = (this.baselinePerformance.average / 10).toFixed(1)
      console.log(`   - Required Improvement: ${requiredImprovement}x`)
      console.log(`   - Gap to Target: ${requiredImprovement < 507 ? 'Achievable' : 'Challenging'}`)
    }
    
    // Recommendations
    console.log('\n💡 Optimization Strategy:')
    console.log('   1. 🔧 Execute corrected SQL functions (immediate)')
    console.log('   2. 📈 Create HNSW index (50-100x improvement expected)')
    console.log('   3. ⚡ Tune query parameters (2-5x additional)')
    console.log('   4. 🔧 Connection pool optimization (2-3x under load)')
    console.log('   5. 📊 Monitor and iterate (continuous improvement)')
    
    // Implementation priority
    console.log('\n🚀 Implementation Priority:')
    console.log('   Priority 1: SQL function deployment (blocks all testing)')
    console.log('   Priority 2: HNSW index creation (major performance gain)')
    console.log('   Priority 3: Parameter tuning (fine optimization)')
  }

  async run() {
    try {
      await this.initialize()
      
      // Generate optimization SQL
      const indexSQL = await this.createOptimizedIndexes()
      
      // Try to measure post-optimization performance (if functions are deployed)
      await this.measureOptimizedPerformance()
      
      // Generate optimization plan
      await this.generateOptimizationPlan()
      
      // Generate final report
      await this.generatePerformanceReport()
      
    } catch (error) {
      console.error('💥 Performance optimization failed:', error)
      throw error
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Main execution
async function main() {
  const optimizer = new PerformanceOptimizer()
  await optimizer.run()
}

// Export for use in other scripts
module.exports = { PerformanceOptimizer }

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
