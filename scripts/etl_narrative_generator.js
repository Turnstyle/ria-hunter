/**
 * ETL Pipeline for Missing Narratives - Phase 2 Implementation
 * Generates narratives for RIA profiles that don't have them
 * Target: Generate 62,317 missing narratives to achieve 100% coverage
 */

const { createClient } = require('@supabase/supabase-js')
const { validateEnvVars } = require('./load-env')

// Load and validate environment variables
const { supabaseUrl, supabaseServiceKey, aiProvider, openaiApiKey, googleProjectId } = validateEnvVars()

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Initialize AI provider based on configuration
let aiClient = null
let isVertexAI = false

if (aiProvider === 'vertex') {
  console.log('🤖 Initializing Vertex AI using existing service account...')
  try {
    // Use the @google-cloud/vertexai package which automatically uses Application Default Credentials
    // This will use the existing docs-ai-service-account credentials from your gcp-key.json
    const { VertexAI } = require('@google-cloud/vertexai')
    
    // Initialize with your project details
    const vertexAI = new VertexAI({
      project: googleProjectId || 'ria-hunter-backend', 
      location: 'us-central1'
    })
    
    // Create clients for text generation and embedding using AVAILABLE models
    // IMPORTANT: Using fully qualified model names with publishers and versions
    console.log('🔍 Looking for available model...')
    
    // First try with gemini-pro model (newer naming convention)
    try {
      aiClient = {
        // Use Gemini Pro model which should be available in any enabled project
        generativeModel: vertexAI.getGenerativeModel({ 
          model: 'gemini-pro',  // This is the newer model name format
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 300
          }
        }),
        
        // Use text-embedding model which should be available
        textEmbedding: vertexAI.getGenerativeModel({ 
          model: 'textembedding-gecko',  // This is the correct model name
          // This model produces 768-dimensional embeddings
          dimensions: 768
        })
      }
      console.log('✅ Using newer model names: gemini-pro and textembedding-gecko')
    } catch (e) {
      console.log('⚠️ Newer model names failed, trying legacy format...')
      
      // Try with legacy model names as fallback
      aiClient = {
        generativeModel: vertexAI.getGenerativeModel({ 
          model: 'gemini-1.0-pro-001',  // Try with specific version
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 300
          }
        }),
        
        // Use Gecko embedding model for vectors
        textEmbedding: vertexAI.getGenerativeModel({ 
          model: 'text-embedding-gecko-001',  // Try with specific version
          dimensions: 768
        })
      }
      console.log('✅ Using legacy model names with versions')
    }
    
    isVertexAI = true
    console.log('✅ Vertex AI initialized successfully with Gemini 1.0 Pro')
  } catch (error) {
    console.warn('⚠️ Vertex AI initialization failed:', error.message)
    console.log('⚠️ Error details:', error)
    console.log('🔄 Falling back to OpenAI...')
  }
}

if (!aiClient) {
  console.log('🤖 Initializing OpenAI...')
  try {
    const OpenAI = require('openai')
    
    // Verify we have an API key
    if (!openaiApiKey) {
      console.warn('⚠️ No OpenAI API key found in environment variables')
      throw new Error('No OpenAI API key available')
    }
    
    // Initialize the client
    aiClient = new OpenAI({
      apiKey: openaiApiKey
    })
    
    // Test that the client is working
    if (!aiClient.chat || typeof aiClient.chat.completions?.create !== 'function') {
      throw new Error('OpenAI client does not have expected methods')
    }
    
    isVertexAI = false
    console.log('✅ OpenAI initialized successfully')
  } catch (error) {
    console.error('❌ OpenAI initialization failed:', error.message)
    console.log('🚨 CRITICAL: Neither Vertex AI nor OpenAI could be initialized')
    console.log('Please check your environment variables and API keys')
    process.exit(1)
  }
}

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
    
    // Get ALL existing narrative CRD numbers with proper pagination
    console.log('   🔄 Loading all existing narratives (may take a moment)...')
    let allExistingNarratives = []
    let hasMore = true
    let offset = 0
    const batchSize = 1000
    
    while (hasMore) {
      const { data: batch, error: narrativeError } = await supabase
        .from('narratives')
        .select('crd_number')
        .range(offset, offset + batchSize - 1)
      
      if (narrativeError) {
        throw new Error(`Failed to fetch existing narratives: ${narrativeError.message}`)
      }
      
      if (!batch || batch.length === 0) {
        hasMore = false
      } else {
        allExistingNarratives = allExistingNarratives.concat(batch)
        offset += batchSize
        hasMore = batch.length === batchSize
      }
    }
    
    // Create a Set for faster lookup
    const existingCrds = new Set(allExistingNarratives.map(n => n.crd_number))
    console.log(`   📊 Found ${existingCrds.size.toLocaleString()} existing narratives to exclude`)
    
    // Validate we got all narratives
    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
    
    if (existingCrds.size !== narrativeCount) {
      console.warn(`   ⚠️ Warning: Loaded ${existingCrds.size} but database has ${narrativeCount} narratives`)
    }
    
    // Get profiles that don't have narratives
    const { data: allProfiles, error: profileError } = await supabase
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
      .not('legal_name', 'is', null)
      .limit(limit * 5) // Get more candidates to account for filtering
    
    if (profileError) {
      throw new Error(`Failed to fetch profiles: ${profileError.message}`)
    }
    
    // Filter out profiles that already have narratives
    const missingProfiles = allProfiles.filter(profile => !existingCrds.has(profile.crd_number))
    
    // Return up to the requested limit
    const results = missingProfiles.slice(0, limit)
    
    console.log(`   ✅ Found ${results.length} profiles needing narratives (from ${allProfiles.length} candidates, ${missingProfiles.length} actually missing)`)
    return results
  }

  async generateNarrative(profile) {
    const { legal_name, city, state, aum, private_fund_count, private_fund_aum } = profile
    
    // Create a comprehensive narrative prompt
    const prompt = this.createNarrativePrompt(profile)
    
    try {
      let narrative = null
      
      if (isVertexAI) {
        // Use Vertex AI Gemini 1.0 Pro
        console.log(`   🤖 Generating narrative for ${legal_name || 'unnamed firm'} using Vertex AI...`)
        
        try {
          // Format the request according to Gemini API structure (based on your example)
          const response = await aiClient.generativeModel.generateContent({
            contents: [{
              role: 'user',
              parts: [{
                text: `You are a financial services analyst creating professional investment advisor narratives. 
                      Write informative, factual descriptions without making unverified claims.
                      
                      ${prompt}`
              }]
            }],
            // These match the settings from your example
            safetySettings: [{
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_LOW_AND_ABOVE"
            }]
            // Generation config is set when initializing the model
          })
          
          // Extract the generated text - check for both response formats
          if (response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            narrative = response.response.candidates[0].content.parts[0].text.trim()
          } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            narrative = response.candidates[0].content.parts[0].text.trim()
          } else {
            console.warn('   ⚠️ Unusual response format from Vertex AI:', JSON.stringify(response).substring(0, 200) + '...')
            throw new Error('Could not extract narrative from Vertex AI response')
          }
          
        } catch (vertexError) {
          console.error(`   ❌ Vertex AI error:`, vertexError.message)
          console.log('   🔄 Falling back to OpenAI for this narrative')
          // Fall back to OpenAI for this specific narrative
          return this.generateNarrativeWithOpenAI(prompt)
        }
        
      } else {
        // Use OpenAI
        return this.generateNarrativeWithOpenAI(prompt)
      }
      
      if (!narrative || narrative.length < 50) {
        throw new Error('Generated narrative too short or empty')
      }
      
      return narrative
      
    } catch (error) {
      if (error.response?.status === 429 || error.message?.includes('rate')) {
        // Rate limit - wait longer
        await this.delay(5000)
        throw new Error('Rate limited - will retry')
      }
      throw error
    }
  }
  
  // Separate method for OpenAI generation to simplify fallback logic
  async generateNarrativeWithOpenAI(prompt) {
    console.log(`   📝 Generating narrative using OpenAI fallback...`)
    
    const response = await aiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system", 
        content: "You are a financial services analyst creating professional investment advisor narratives. Write informative, factual descriptions without making unverified claims."
      }, {
        role: "user",
        content: prompt
      }],
      max_tokens: 300,
      temperature: 0.3
    })
    
    return response.choices[0]?.message?.content?.trim()
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
      let embedding = null
      
      if (isVertexAI) {
        // Use Vertex AI text embeddings with Gecko model
        console.log(`   🧠 Generating embedding using Vertex AI text-embedding-gecko...`)
        
        try {
          // Format according to Vertex AI embeddings API structure
          const response = await aiClient.textEmbedding.generateContent({
            contents: [{
              parts: [{ text: text }]
            }]
          })
          
          // Vertex AI embeddings response can have different structures
          // Try all possible paths to the embedding values
          if (response.embeddings?.[0]?.values) {
            embedding = response.embeddings[0].values
          } else if (response.embeddings?.[0]) {
            embedding = response.embeddings[0]
          } else if (response.embedding?.values) {
            embedding = response.embedding.values
          } else if (response.response?.embeddings?.[0]?.values) {
            embedding = response.response.embeddings[0].values
          } else if (response.response?.embedding?.values) {
            embedding = response.response.embedding.values
          } else {
            console.warn('   ⚠️ Unusual embedding response format:', JSON.stringify(response).substring(0, 200) + '...')
            throw new Error('Could not extract embedding from Vertex AI response')
          }
          
        } catch (vertexError) {
          console.error(`   ❌ Vertex AI embedding error:`, vertexError.message)
          console.log('   🔄 Falling back to OpenAI for this embedding')
          // Fall back to OpenAI for this specific embedding
          return this.generateEmbeddingWithOpenAI(text)
        }
        
      } else {
        // Use OpenAI embeddings
        return this.generateEmbeddingWithOpenAI(text)
      }
      
      // Validate the embedding
      if (!embedding || !Array.isArray(embedding)) {
        console.error('   ❌ Invalid embedding format received:', embedding)
        throw new Error('Invalid embedding format received')
      }
      
      // Confirm proper dimensionality
      if (embedding.length !== 768) {
        console.warn(`   ⚠️ Expected 768 dimensions but got ${embedding.length}`)
      }
      
      return embedding
      
    } catch (error) {
      if (error.response?.status === 429 || error.message?.includes('rate')) {
        await this.delay(3000)
        throw new Error('Rate limited - will retry')
      }
      throw error
    }
  }
  
  // Separate method for OpenAI embeddings to simplify fallback logic
  async generateEmbeddingWithOpenAI(text) {
    console.log(`   📏 Generating embedding using OpenAI fallback...`)
    
    const response = await aiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 768
    })
    
    return response.data[0].embedding
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
