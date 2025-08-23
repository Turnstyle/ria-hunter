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
  
  console.log('✅ Environment variables loaded successfully')
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY
  }
}

module.exports = { validateEnvVars }
