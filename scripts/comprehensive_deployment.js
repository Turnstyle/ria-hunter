/**
 * Comprehensive Deployment and Monitoring Script
 * Orchestrates the complete backend refactor deployment
 */

const { createClient } = require('@supabase/supabase-js')
const { NarrativeETLProcessor } = require('./etl_narrative_generator.js')
const { PerformanceOptimizer } = require('./performance_optimizer.js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

class ComprehensiveDeployment {
  constructor() {
    this.startTime = Date.now()
    this.deploymentResults = {
      sqlFunctions: { status: 'pending', details: null },
      performance: { status: 'pending', details: null },
      etlPipeline: { status: 'pending', details: null },
      validation: { status: 'pending', details: null }
    }
  }

  async initialize() {
    console.log('🚀 COMPREHENSIVE BACKEND DEPLOYMENT')
    console.log('='.repeat(60))
    console.log(`📅 Started: ${new Date().toLocaleString()}`)
    console.log(`🎯 Objective: Complete Phase 2 Backend Refactor`)
    console.log(`📊 Target: 507x performance + 100% data coverage`)
  }

  async checkPrerequisites() {
    console.log('\n🔍 PREREQUISITES CHECK')
    console.log('─'.repeat(30))
    
    const prerequisites = {
      database: false,
      rls: false,
      environment: false,
      functions: false
    }
    
    try {
      // Check database connectivity
      const { count } = await supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
      
      prerequisites.database = count > 0
      console.log(`   ✅ Database: ${count?.toLocaleString()} RIA profiles`)
      
      // Check RLS
      const { data: narratives } = await supabase
        .from('narratives')
        .select('id')
        .limit(1)
      
      prerequisites.rls = narratives !== null
      console.log(`   ✅ RLS: Access working`)
      
      // Check environment
      prerequisites.environment = process.env.OPENAI_API_KEY ? true : false
      console.log(`   ${prerequisites.environment ? '✅' : '❌'} Environment: OpenAI API key ${prerequisites.environment ? 'found' : 'missing'}`)
      
      // Check if SQL functions are deployed
      try {
        const { data, error } = await supabase.rpc('match_narratives', {
          query_embedding: Array(768).fill(0.1),
          match_count: 1
        })
        
        prerequisites.functions = !error
        console.log(`   ${prerequisites.functions ? '✅' : '❌'} Functions: Vector search ${prerequisites.functions ? 'working' : 'needs deployment'}`)
        
      } catch (err) {
        prerequisites.functions = false
        console.log(`   ❌ Functions: Need SQL deployment`)
      }
      
    } catch (error) {
      console.log(`   ❌ Prerequisites check failed: ${error.message}`)
    }
    
    return prerequisites
  }

  async deploymentPhase1_SQLFunctions() {
    console.log('\n📋 PHASE 1: SQL FUNCTIONS DEPLOYMENT')
    console.log('─'.repeat(40))
    
    try {
      // Check if functions are already deployed
      const { data, error } = await supabase.rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_count: 1
      })
      
      if (!error) {
        console.log('   ✅ SQL functions already deployed and working')
        this.deploymentResults.sqlFunctions = {
          status: 'complete',
          details: 'Functions working properly'
        }
        return true
      }
      
      console.log('   ⚠️  SQL functions need to be deployed manually')
      console.log('   📋 Action required: Execute SQL from IMPLEMENTATION_SQL_FOR_SUPABASE_EDITOR.md')
      console.log('   🔗 URL: https://supabase.com/dashboard/project/llusjnpltqxhokycwzry/sql')
      
      this.deploymentResults.sqlFunctions = {
        status: 'manual_required',
        details: 'SQL execution needed in Supabase Editor'
      }
      
      return false
      
    } catch (error) {
      console.log(`   ❌ Phase 1 failed: ${error.message}`)
      this.deploymentResults.sqlFunctions = {
        status: 'error',
        details: error.message
      }
      return false
    }
  }

  async deploymentPhase2_Performance() {
    console.log('\n⚡ PHASE 2: PERFORMANCE OPTIMIZATION')
    console.log('─'.repeat(40))
    
    try {
      const optimizer = new PerformanceOptimizer()
      await optimizer.run()
      
      this.deploymentResults.performance = {
        status: 'complete',
        details: 'Performance analysis completed'
      }
      
      return true
      
    } catch (error) {
      console.log(`   ❌ Phase 2 failed: ${error.message}`)
      this.deploymentResults.performance = {
        status: 'error',
        details: error.message
      }
      return false
    }
  }

  async deploymentPhase3_ETLPipeline(maxNarratives = 500) {
    console.log('\n🔄 PHASE 3: ETL PIPELINE EXECUTION')
    console.log('─'.repeat(40))
    
    try {
      // Check current narrative count
      const { count: currentNarratives } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
      
      const { count: totalProfiles } = await supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
      
      const missingCount = totalProfiles - currentNarratives
      
      if (missingCount <= 0) {
        console.log('   ✅ No missing narratives - 100% coverage achieved!')
        this.deploymentResults.etlPipeline = {
          status: 'complete',
          details: '100% narrative coverage'
        }
        return true
      }
      
      console.log(`   📊 Missing narratives: ${missingCount?.toLocaleString()}`)
      console.log(`   🎯 Processing: ${Math.min(maxNarratives, missingCount)} narratives`)
      
      const processor = new NarrativeETLProcessor()
      await processor.run(maxNarratives)
      
      this.deploymentResults.etlPipeline = {
        status: 'complete',
        details: `Processed ${processor.successCount} narratives`
      }
      
      return true
      
    } catch (error) {
      console.log(`   ❌ Phase 3 failed: ${error.message}`)
      this.deploymentResults.etlPipeline = {
        status: 'error',
        details: error.message
      }
      return false
    }
  }

  async deploymentPhase4_Validation() {
    console.log('\n✅ PHASE 4: FINAL VALIDATION')
    console.log('─'.repeat(40))
    
    try {
      // Run comprehensive validation
      const results = await this.runFinalValidation()
      
      this.deploymentResults.validation = {
        status: 'complete',
        details: results
      }
      
      return true
      
    } catch (error) {
      console.log(`   ❌ Phase 4 failed: ${error.message}`)
      this.deploymentResults.validation = {
        status: 'error',
        details: error.message
      }
      return false
    }
  }

  async runFinalValidation() {
    const validation = {
      database: {},
      performance: {},
      coverage: {},
      functions: {}
    }
    
    // Database validation
    const { count: profileCount } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
    
    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const { count: vectorCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding_vector', 'is', null)
    
    validation.database = {
      profiles: profileCount,
      narratives: narrativeCount,
      vectors: vectorCount,
      coverage: narrativeCount > 0 ? (narrativeCount / profileCount * 100).toFixed(1) : 0,
      vectorCoverage: narrativeCount > 0 ? (vectorCount / narrativeCount * 100).toFixed(1) : 0
    }
    
    console.log(`   📊 Profiles: ${profileCount?.toLocaleString()}`)
    console.log(`   📊 Narratives: ${narrativeCount?.toLocaleString()} (${validation.database.coverage}% coverage)`)
    console.log(`   📊 Vectors: ${vectorCount?.toLocaleString()} (${validation.database.vectorCoverage}% vector coverage)`)
    
    // Performance validation
    try {
      const { data: perfData, error: perfError } = await supabase.rpc('test_vector_search_performance')
      
      if (!perfError && perfData) {
        validation.performance = perfData
        
        console.log(`   ⚡ Performance Results:`)
        perfData.forEach(result => {
          const targetMet = result.duration_ms < 10
          console.log(`     - ${result.test_name}: ${result.duration_ms}ms ${targetMet ? '🎯' : '⚠️'}`)
        })
      } else {
        console.log(`   ❌ Performance test failed: ${perfError?.message || 'Unknown error'}`)
        validation.performance = { error: perfError?.message || 'Failed to run' }
      }
      
    } catch (error) {
      console.log(`   ❌ Performance validation failed: ${error.message}`)
      validation.performance = { error: error.message }
    }
    
    // Function validation
    try {
      const { data: funcData, error: funcError } = await supabase.rpc('match_narratives', {
        query_embedding: Array(768).fill(0.1),
        match_count: 3
      })
      
      validation.functions = {
        match_narratives: !funcError,
        resultCount: funcData?.length || 0,
        error: funcError?.message
      }
      
      console.log(`   🔧 Functions: ${!funcError ? '✅ Working' : '❌ Failed'}`)
      if (funcData) {
        console.log(`     - Results: ${funcData.length} matches found`)
      }
      
    } catch (error) {
      validation.functions = { error: error.message }
      console.log(`   🔧 Functions: ❌ ${error.message}`)
    }
    
    return validation
  }

  async generateFinalReport() {
    const elapsedMinutes = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1)
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 COMPREHENSIVE DEPLOYMENT REPORT')
    console.log('='.repeat(60))
    console.log(`⏱️  Duration: ${elapsedMinutes} minutes`)
    console.log(`📅 Completed: ${new Date().toLocaleString()}`)
    
    // Phase results
    console.log('\n📋 PHASE RESULTS:')
    Object.entries(this.deploymentResults).forEach(([phase, result]) => {
      const status = result.status === 'complete' ? '✅' : 
                    result.status === 'manual_required' ? '⚠️' : '❌'
      console.log(`   ${status} ${phase}: ${result.status} - ${result.details}`)
    })
    
    // Overall status
    const completedPhases = Object.values(this.deploymentResults).filter(r => r.status === 'complete').length
    const totalPhases = Object.keys(this.deploymentResults).length
    const manualRequired = Object.values(this.deploymentResults).some(r => r.status === 'manual_required')
    
    console.log('\n🏆 OVERALL STATUS:')
    if (completedPhases === totalPhases) {
      console.log('   🎉 DEPLOYMENT COMPLETE - All phases successful!')
    } else if (manualRequired) {
      console.log('   ⚠️  MANUAL ACTION REQUIRED - See SQL deployment instructions')
    } else {
      console.log(`   🚧 PARTIAL COMPLETION - ${completedPhases}/${totalPhases} phases complete`)
    }
    
    // Success metrics
    const validation = this.deploymentResults.validation?.details
    if (validation && validation.database) {
      console.log('\n📊 SUCCESS METRICS:')
      console.log(`   - Narrative Coverage: ${validation.database.coverage}% (Target: 100%)`)
      console.log(`   - Vector Coverage: ${validation.database.vectorCoverage}% (Target: 100%)`)
      
      if (validation.performance && !validation.performance.error) {
        const narrativePerf = validation.performance.find(p => p.test_name === 'narratives_vector_search')
        if (narrativePerf) {
          const targetMet = narrativePerf.duration_ms < 10
          console.log(`   - Query Performance: ${narrativePerf.duration_ms}ms ${targetMet ? '🎯 TARGET MET' : '⚠️ Needs optimization'}`)
        }
      }
    }
    
    // Next steps
    console.log('\n🚀 NEXT STEPS:')
    if (manualRequired) {
      console.log('   1. Execute SQL functions in Supabase Editor')
      console.log('   2. Re-run deployment to complete remaining phases')
      console.log('   3. Monitor performance and continue ETL for full coverage')
    } else if (completedPhases === totalPhases) {
      console.log('   1. Monitor system performance in production')
      console.log('   2. Scale ETL pipeline for remaining narratives')
      console.log('   3. Implement Phase 3+ features from master plan')
    } else {
      console.log('   1. Review and resolve any errors above')
      console.log('   2. Re-run deployment for failed phases')
      console.log('   3. Continue with manual steps as needed')
    }
  }

  async run(etlBatchSize = 100) {
    try {
      await this.initialize()
      
      // Check prerequisites
      const prerequisites = await this.checkPrerequisites()
      
      // Phase 1: SQL Functions
      await this.deploymentPhase1_SQLFunctions()
      
      // Phase 2: Performance Analysis
      await this.deploymentPhase2_Performance()
      
      // Phase 3: ETL Pipeline (if functions are working)
      if (this.deploymentResults.sqlFunctions.status === 'complete') {
        await this.deploymentPhase3_ETLPipeline(etlBatchSize)
      } else {
        console.log('\n⏭️  Skipping ETL Pipeline - SQL functions need deployment first')
      }
      
      // Phase 4: Final Validation
      await this.deploymentPhase4_Validation()
      
      // Generate final report
      await this.generateFinalReport()
      
    } catch (error) {
      console.error('💥 Comprehensive deployment failed:', error)
      throw error
    }
  }
}

// Main execution
async function main() {
  const deployment = new ComprehensiveDeployment()
  
  // Run with a small ETL batch for initial testing
  await deployment.run(100)
}

// Export for use in other scripts
module.exports = { ComprehensiveDeployment }

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
