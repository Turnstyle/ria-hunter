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
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'GOOGLE_PROJECT_ID'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    console.error('💡 Make sure your .env file exists and contains all required variables')
    process.exit(1)
  }
  
  if (!process.env.GCP_SA_KEY_BASE64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('❌ Vertex AI credentials are not configured. Set GCP_SA_KEY_BASE64 or an alternative credential variable.')
    process.exit(1)
  }
  
  console.log('✅ Environment variables loaded successfully (Vertex AI only)')
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    googleProjectId: process.env.GOOGLE_PROJECT_ID,
    vertexLocation: process.env.VERTEX_AI_LOCATION || 'us-central1',
    gcpCredentials: process.env.GCP_SA_KEY_BASE64 || process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
  }
}

module.exports = { validateEnvVars }
