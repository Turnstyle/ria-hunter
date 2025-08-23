/**
 * Environment Variable Loader
 * Ensures environment variables are loaded from .env file
 * Use this at the top of any script that needs environment variables
 */

require('dotenv').config()

function validateEnvVars() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    console.error('💡 Make sure your .env file exists and contains all required variables')
    process.exit(1)
  }
  
  // Check AI provider configuration
  const aiProvider = process.env.AI_PROVIDER || 'openai'
  console.log(`🤖 AI Provider: ${aiProvider.toUpperCase()}`)
  
  if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY required when AI_PROVIDER=openai')
    process.exit(1)
  }
  
  if (aiProvider === 'vertex' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('⚠️ GOOGLE_APPLICATION_CREDENTIALS not set for Vertex AI')
  }
  
  console.log('✅ Environment variables loaded successfully')
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    aiProvider: aiProvider,
    googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    googleProjectId: process.env.GOOGLE_PROJECT_ID,
    googleAiStudioKey: process.env.GOOGLE_AI_STUDIO_API_KEY
  }
}

module.exports = { validateEnvVars }
