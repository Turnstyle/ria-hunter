/**
 * ETL Pipeline for Missing Narratives - Phase 2 Implementation
 * Generates narratives for RIA profiles that don't have them
 * Target: Generate 62,317 missing narratives to achieve 100% coverage
 */

const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

// Configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

class NarrativeETLProcessor {
  constructor() {
    this.batchSize = 50  // Process in smaller batches
    this.maxRetries = 3
    this.retryDelay = 2000 // 2 seconds
    this.processedCount = 0
    this.successCount = 0
    this.errorCount = 0
    this.startTime = Date.now()
  }

  async initialize() {
    console.log('🚀 INITIALIZING NARRATIVE ETL PIPELINE')
    console.log('='.repeat(50))
    
    // Check current state
    const { count: totalProfiles } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
    
    const { count: totalNarratives } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    const missingCount = totalProfiles - totalNarratives
    
    console.log(`📊 Current State:`)
    console.log(`   - Total RIA Profiles: ${totalProfiles?.toLocaleString()}`)
    console.log(`   - Existing Narratives: ${totalNarratives?.toLocaleString()}`)
    console.log(`   - Missing Narratives: ${missingCount?.toLocaleString()}`)
    console.log(`   - Target: Generate ${missingCount} new narratives`)
    
    return { totalProfiles, totalNarratives, missingCount }
  }

  async getMissingProfiles(limit = 100) {
    console.log(`\n🔍 Getting ${limit} profiles without narratives...`)
    
    const { data: profiles, error } = await supabase
      .from('ria_profiles')
      .select(`
        crd_number,
        legal_name,
        city,
        state,
        aum,
        form_adv_date,
        private_fund_count,
        private_fund_aum,
        phone,
        website
      `)
      .not('crd_number', 'in', 
        supabase
          .from('narratives')
          .select('crd_number')
      )
      .not('legal_name', 'is', null)
      .limit(limit)
    
    if (error) {
      throw new Error(`Failed to fetch missing profiles: ${error.message}`)
    }
    
    console.log(`   ✅ Found ${data?.length || 0} profiles needing narratives`)
    return data || []
  }

  async generateNarrative(profile) {
    const { legal_name, city, state, aum, private_fund_count, private_fund_aum } = profile
    
    // Create a comprehensive narrative prompt
    const prompt = this.createNarrativePrompt(profile)
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system", 
          content: "You are a financial services analyst creating professional investment advisor narratives. Write informative, factual descriptions without making unverified claims."
        }, {
          role: "user",
          content: prompt
        }],
        max_tokens: 300,
        temperature: 0.3  // Lower temperature for more consistent, factual content
      })
      
      const narrative = response.choices[0]?.message?.content?.trim()
      
      if (!narrative || narrative.length < 50) {
        throw new Error('Generated narrative too short or empty')
      }
      
      return narrative
      
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limit - wait longer
        await this.delay(5000)
        throw new Error('Rate limited - will retry')
      }
      throw error
    }
  }

  createNarrativePrompt(profile) {
    const { legal_name, city, state, aum, private_fund_count, private_fund_aum, phone, website } = profile
    
    let prompt = `Write a professional narrative for this investment advisory firm:\n\n`
    prompt += `Firm: ${legal_name}\n`
    
    if (city && state) {
      prompt += `Location: ${city}, ${state}\n`
    }
    
    if (aum && aum > 0) {
      prompt += `Assets Under Management: $${(aum / 1000000).toFixed(0)}M\n`
    }
    
    if (private_fund_count && private_fund_count > 0) {
      prompt += `Private Funds: ${private_fund_count} funds`
      if (private_fund_aum && private_fund_aum > 0) {
        prompt += ` ($${(private_fund_aum / 1000000).toFixed(0)}M AUM)`
      }
      prompt += `\n`
    }
    
    prompt += `\nWrite a 2-3 sentence professional description focusing on:`
    prompt += `\n- Investment advisory services`
    prompt += `\n- Client focus and expertise areas`
    prompt += `\n- Professional approach and capabilities`
    prompt += `\n\nKeep it factual, professional, and under 250 words.`
    
    return prompt
  }

  async generateEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 768
      })
      
      return response.data[0].embedding
      
    } catch (error) {
      if (error.response?.status === 429) {
        await this.delay(3000)
        throw new Error('Rate limited - will retry')
      }
      throw error
    }
  }

  async processProfile(profile, retryCount = 0) {
    try {
      // Generate narrative
      const narrative = await this.generateNarrative(profile)
      
      // Generate embedding
      const embedding = await this.generateEmbedding(narrative)
      
      // Insert into database
      const { error } = await supabase
        .from('narratives')
        .insert({
          crd_number: profile.crd_number,
          narrative: narrative,
          embedding_vector: JSON.stringify(embedding), // Store as JSON string
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        throw new Error(`Database insert failed: ${error.message}`)
      }
      
      this.successCount++
      console.log(`    ✅ ${profile.legal_name} (CRD: ${profile.crd_number})`)
      
      return true
      
    } catch (error) {
      if (retryCount < this.maxRetries && (
        error.message.includes('Rate limited') || 
        error.message.includes('timeout') ||
        error.response?.status >= 500
      )) {
        console.log(`    ⏳ Retrying ${profile.legal_name} (attempt ${retryCount + 1}/${this.maxRetries})`)
        await this.delay(this.retryDelay * (retryCount + 1))
        return await this.processProfile(profile, retryCount + 1)
      }
      
      console.log(`    ❌ Failed ${profile.legal_name}: ${error.message}`)
      this.errorCount++
      return false
    }
  }

  async processBatch(profiles) {
    console.log(`\n📦 Processing batch of ${profiles.length} profiles...`)
    
    const results = []
    
    for (const profile of profiles) {
      const result = await this.processProfile(profile)
      results.push(result)
      this.processedCount++
      
      // Small delay between requests to avoid rate limits
      await this.delay(500)
    }
    
    const batchSuccessCount = results.filter(r => r).length
    const batchErrorCount = results.filter(r => !r).length
    
    console.log(`   📊 Batch complete: ${batchSuccessCount} success, ${batchErrorCount} errors`)
    
    return results
  }

  async run(maxProfilesToProcess = 1000) {
    try {
      const { missingCount } = await this.initialize()
      
      if (missingCount === 0) {
        console.log('🎉 No missing narratives found - all profiles have narratives!')
        return
      }
      
      const targetCount = Math.min(maxProfilesToProcess, missingCount)
      console.log(`\n🎯 Target: Process ${targetCount} profiles in batches of ${this.batchSize}`)
      
      let processedTotal = 0
      
      while (processedTotal < targetCount) {
        const remaining = targetCount - processedTotal
        const batchLimit = Math.min(this.batchSize, remaining)
        
        // Get next batch of missing profiles
        const profiles = await this.getMissingProfiles(batchLimit)
        
        if (!profiles || profiles.length === 0) {
          console.log('✅ No more profiles to process')
          break
        }
        
        // Process the batch
        await this.processBatch(profiles)
        
        processedTotal += profiles.length
        
        // Progress update
        const elapsedMinutes = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1)
        const progressPercent = ((processedTotal / targetCount) * 100).toFixed(1)
        const successRate = ((this.successCount / this.processedCount) * 100).toFixed(1)
        
        console.log(`\n📈 PROGRESS UPDATE:`)
        console.log(`   - Processed: ${processedTotal}/${targetCount} (${progressPercent}%)`)
        console.log(`   - Success: ${this.successCount} (${successRate}%)`)
        console.log(`   - Errors: ${this.errorCount}`)
        console.log(`   - Elapsed: ${elapsedMinutes} minutes`)
        console.log(`   - Rate: ${(this.processedCount / (elapsedMinutes || 1) * 60).toFixed(0)} profiles/hour`)
        
        // Brief pause between batches
        await this.delay(2000)
      }
      
      this.generateFinalReport()
      
    } catch (error) {
      console.error('💥 ETL Pipeline failed:', error)
      throw error
    }
  }

  generateFinalReport() {
    const elapsedMinutes = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1)
    const successRate = this.processedCount > 0 ? ((this.successCount / this.processedCount) * 100).toFixed(1) : 0
    
    console.log('\n' + '='.repeat(50))
    console.log('🎉 ETL PIPELINE COMPLETE')
    console.log('='.repeat(50))
    console.log(`📊 Final Results:`)
    console.log(`   - Total Processed: ${this.processedCount}`)
    console.log(`   - Successful: ${this.successCount}`)
    console.log(`   - Errors: ${this.errorCount}`)
    console.log(`   - Success Rate: ${successRate}%`)
    console.log(`   - Duration: ${elapsedMinutes} minutes`)
    console.log(`   - Average Rate: ${(this.successCount / (elapsedMinutes || 1) * 60).toFixed(0)} narratives/hour`)
    
    if (this.errorCount > 0) {
      console.log(`\n⚠️  ${this.errorCount} profiles failed - consider re-running for these`)
    }
    
    console.log(`\n🎯 Next Steps:`)
    console.log(`   1. Re-run validation to check updated narrative count`)
    console.log(`   2. Test vector search performance`)
    console.log(`   3. Continue with remaining ${62317 - this.successCount} narratives if needed`)
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Main execution
async function main() {
  const processor = new NarrativeETLProcessor()
  
  // Start with a test batch of 100 profiles
  await processor.run(100)
}

// Export for use in other scripts
module.exports = { NarrativeETLProcessor }

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
