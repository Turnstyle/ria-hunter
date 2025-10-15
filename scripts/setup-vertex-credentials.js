#!/usr/bin/env node

/**
 * Setup script for Vertex AI credentials in Vercel
 * Based on Gemini Technical Specification Document Section 2.1.3
 * 
 * This script:
 * 1. Reads the gcp-key.json file
 * 2. Base64 encodes it
 * 3. Provides instructions for setting up in Vercel
 */

const fs = require('fs');
const path = require('path');

console.log('🔐 Vertex AI Credential Setup Script');
console.log('=====================================\n');

// Read the service account key file
const keyPath = path.resolve(__dirname, '../gcp-key.json');

if (!fs.existsSync(keyPath)) {
  console.error('❌ Error: gcp-key.json file not found at:', keyPath);
  console.log('\nPlease ensure you have the service account key file in the project root.');
  process.exit(1);
}

try {
  // Read and validate the JSON
  const keyContent = fs.readFileSync(keyPath, 'utf-8');
  const keyJson = JSON.parse(keyContent);
  
  // Validate required fields
  if (!keyJson.type || keyJson.type !== 'service_account') {
    throw new Error('Invalid service account key: type must be "service_account"');
  }
  
  if (!keyJson.private_key || !keyJson.client_email || !keyJson.project_id) {
    throw new Error('Invalid service account key: missing required fields');
  }
  
  console.log('✅ Valid service account key found');
  console.log(`📧 Service Account: ${keyJson.client_email}`);
  console.log(`🏗️  Project ID: ${keyJson.project_id}\n`);
  
  // Base64 encode the entire JSON
  const base64Encoded = Buffer.from(keyContent).toString('base64');
  
  console.log('📝 Base64 Encoded Credential (for Vercel):');
  console.log('==========================================');
  console.log(`GCP_SA_KEY_BASE64=${base64Encoded}`);
  console.log('==========================================\n');
  
  // Write to a temporary file for easy copying
  const envPath = path.resolve(__dirname, '../.env.vertex-setup');
  const envContent = `# Vertex AI Base64 Encoded Credentials
# Add this to your Vercel environment variables as SENSITIVE
GCP_SA_KEY_BASE64=${base64Encoded}

# Also ensure these are set:
GOOGLE_PROJECT_ID=${keyJson.project_id}
VERTEX_AI_LOCATION=us-central1
`;
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Environment variables written to: .env.vertex-setup');
  
  console.log('\n📋 SETUP INSTRUCTIONS:');
  console.log('======================');
  console.log('1. LOCAL DEVELOPMENT:');
  console.log('   - Add the above GCP_SA_KEY_BASE64 to your .env.local file');
  console.log('   - Remove or comment out GOOGLE_APPLICATION_CREDENTIALS_JSON if present');
  console.log('\n2. VERCEL PRODUCTION:');
  console.log('   a. Go to your Vercel project settings');
  console.log('   b. Navigate to Environment Variables');
  console.log('   c. Add GCP_SA_KEY_BASE64 with the value above');
  console.log('   d. IMPORTANT: Mark it as "Sensitive" (checkbox)');
  console.log('   e. Ensure GOOGLE_PROJECT_ID is set to:', keyJson.project_id);
  console.log('   f. Set VERTEX_AI_LOCATION to: us-central1');
  console.log('\n3. SECURITY NOTES:');
  console.log('   - Never commit the .env.vertex-setup file');
  console.log('   - The Base64 value is sensitive - treat it like a password');
  console.log('   - Rotate keys quarterly as per security best practices');
  
  console.log('\n✨ Script completed successfully!');
  
} catch (error) {
  console.error('❌ Error processing service account key:', error.message);
  process.exit(1);
}
