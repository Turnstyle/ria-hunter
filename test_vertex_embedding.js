/**
 * Direct test of Vertex AI embedding generation
 * This will help diagnose why semantic search is failing
 */

require('dotenv').config({ path: './env.local' });

async function testVertexEmbedding() {
  console.log('🧪 Testing Vertex AI Embedding Generation');
  console.log('=========================================\n');
  
  // Check environment variables
  console.log('📋 Environment Configuration:');
  console.log(`   GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT || 'NOT SET'}`);
  console.log(`   GOOGLE_PROJECT_ID: ${process.env.GOOGLE_PROJECT_ID || 'NOT SET'}`);
  console.log(`   GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'NOT SET'}`);
  console.log(`   AI_PROVIDER: ${process.env.AI_PROVIDER || 'NOT SET'}`);
  
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  
  if (!projectId) {
    console.error('\n❌ ERROR: No Google Cloud Project ID configured!');
    return;
  }
  
  console.log(`\n🔧 Using Project: ${projectId}`);
  console.log(`📍 Using Location: ${location}`);
  
  // Test text for embedding
  const testText = "Investment advisor specializing in retirement planning";
  console.log(`\n📝 Test text: "${testText}"\n`);
  
  try {
    // Import Google Auth
    const { GoogleAuth } = require('google-auth-library');
    
    console.log('🔑 Initializing Google Auth...');
    const auth = new GoogleAuth({ 
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    // Get access token
    console.log('🎫 Getting access token...');
    const accessToken = await auth.getAccessToken();
    
    if (!accessToken) {
      console.error('❌ Failed to get access token!');
      console.log('   This usually means the service account key is invalid or missing permissions.');
      return;
    }
    
    console.log('✅ Access token obtained');
    
    // Build the API URL
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`;
    console.log(`\n🌐 API URL: ${url}`);
    
    // Make the API request
    console.log('\n📤 Making embedding request...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ content: testText }]
      })
    });
    
    console.log(`📥 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('\n❌ API Error Response:');
      console.error(errorText);
      
      // Common error explanations
      if (response.status === 403) {
        console.log('\n💡 Error 403 usually means:');
        console.log('   - Vertex AI API is not enabled for this project');
        console.log('   - Service account lacks permissions');
        console.log('   - Billing is not enabled');
      } else if (response.status === 404) {
        console.log('\n💡 Error 404 usually means:');
        console.log('   - Wrong location or model name');
        console.log('   - text-embedding-005 might not be available in this location');
      }
      return;
    }
    
    // Parse the response
    const result = await response.json();
    
    // Check for embedding
    const embedding = result?.predictions?.[0]?.embeddings?.values;
    
    if (Array.isArray(embedding)) {
      console.log('\n✅ SUCCESS! Embedding generated');
      console.log(`   - Dimensions: ${embedding.length}`);
      console.log(`   - First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      
      // Verify it's 768 dimensions as expected
      if (embedding.length === 768) {
        console.log('   ✓ Correct dimension count (768)');
      } else {
        console.log(`   ⚠️ Unexpected dimension count (expected 768, got ${embedding.length})`);
      }
    } else {
      console.error('\n❌ No embedding in response!');
      console.log('Response structure:', JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ Exception occurred:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('ENOENT')) {
      console.log('\n💡 File not found error usually means:');
      console.log('   - GOOGLE_APPLICATION_CREDENTIALS points to non-existent file');
      console.log(`   - Looking for: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    } else if (error.message.includes('fetch')) {
      console.log('\n💡 Fetch error usually means:');
      console.log('   - Network connectivity issue');
      console.log('   - Invalid URL or location');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

// Run the test
testVertexEmbedding().catch(console.error);
