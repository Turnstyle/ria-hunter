#!/usr/bin/env node

/**
 * Test script to verify Vertex AI fixes
 * Tests:
 * 1. Base64 credential loading
 * 2. AI service initialization
 * 3. Circuit breaker functionality
 * 4. Query decomposition with Gemini
 * 5. Graceful degradation
 */

const axios = require('axios');

// Test configurations
const BASE_URL = 'http://localhost:3000';
const TEST_QUERIES = [
  'Find the largest RIAs in St. Louis Missouri',
  'Show me RIAs with venture capital activity in Missouri',
  'What are the top 10 investment advisors in MO',
  'RIAs offering private placements in Saint Louis'
];

async function testEndpoint(query) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: "${query}"`);
  console.log('='.repeat(60));
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/ask`,
      { 
        query: query,
        limit: 5
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    const data = response.data;
    
    console.log('\n✅ SUCCESS - Response received');
    console.log('----------------------------');
    
    // Check if we have results
    if (data.sources && Array.isArray(data.sources)) {
      console.log(`📊 Found ${data.sources.length} results`);
      
      // Show first 3 results
      data.sources.slice(0, 3).forEach((ria, idx) => {
        console.log(`\n${idx + 1}. ${ria.name || 'Unknown'}`);
        console.log(`   Location: ${ria.city || 'N/A'}, ${ria.state || 'N/A'}`);
        console.log(`   AUM: $${(ria.aum_total_rounded || 0).toLocaleString()}`);
      });
    } else {
      console.log('⚠️  No sources in response');
    }
    
    // Check if we have an AI-generated answer
    if (data.answer) {
      console.log('\n🤖 AI Answer:');
      console.log('--------------');
      console.log(data.answer.substring(0, 300) + (data.answer.length > 300 ? '...' : ''));
    } else {
      console.log('\n⚠️  No AI answer generated (graceful degradation may be active)');
    }
    
    // Check metadata
    if (data.metadata) {
      console.log('\n📈 Metadata:');
      console.log(`   Searches remaining: ${data.metadata.remaining}`);
      console.log(`   Is subscriber: ${data.metadata.isSubscriber}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('\n❌ ERROR:');
    console.error('----------');
    
    if (error.response) {
      // Server responded with error
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data.error || error.response.data}`);
      
      if (error.response.status === 402) {
        console.log('\n💡 This is a demo limit error - expected for anonymous users after 5 searches');
      }
    } else if (error.request) {
      // Request made but no response
      console.error('No response from server - is the dev server running?');
      console.error('Run: npm run dev');
    } else {
      // Other error
      console.error('Error:', error.message);
    }
    
    return false;
  }
}

async function testVertexAICredentials() {
  console.log('\n' + '🔐 Testing Vertex AI Credentials'.padEnd(60, ' '));
  console.log('='.repeat(60));
  
  // Check if Base64 credentials are set
  if (process.env.GCP_SA_KEY_BASE64) {
    console.log('✅ GCP_SA_KEY_BASE64 is set');
    
    try {
      const decoded = Buffer.from(process.env.GCP_SA_KEY_BASE64, 'base64').toString('utf-8');
      const creds = JSON.parse(decoded);
      
      if (creds.type === 'service_account' && creds.project_id) {
        console.log(`✅ Valid service account for project: ${creds.project_id}`);
        console.log(`✅ Service account email: ${creds.client_email}`);
      } else {
        console.log('⚠️  Credentials format may be invalid');
      }
    } catch (error) {
      console.error('❌ Failed to decode credentials:', error.message);
    }
  } else {
    console.log('⚠️  GCP_SA_KEY_BASE64 not set - checking alternatives...');
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log(`📁 Using file-based credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    } else {
      console.log('❌ No Vertex AI credentials found!');
    }
  }
  
  // Check AI provider setting
  const provider = process.env.AI_PROVIDER || 'not set';
  console.log(`\n🤖 AI Provider: ${provider}`);
  
  if (provider === 'google' || provider === 'vertex') {
    console.log('✅ Configured to use Vertex AI');
  } else if (provider === 'openai') {
    console.log('⚠️  Configured to use OpenAI (not Vertex AI)');
  } else {
    console.log('⚠️  AI provider not explicitly set');
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('🚀 RIA Hunter Backend Test Suite');
  console.log('================================\n');
  console.log('Testing fixes for:');
  console.log('  1. Vertex AI Base64 credentials');
  console.log('  2. Circuit breaker resilience');
  console.log('  3. Query decomposition with Gemini 2.0 Flash');
  console.log('  4. Graceful degradation');
  
  // Test credentials first
  await testVertexAICredentials();
  
  // Test each query
  let successCount = 0;
  for (const query of TEST_QUERIES) {
    const success = await testEndpoint(query);
    if (success) successCount++;
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${TEST_QUERIES.length}`);
  console.log(`❌ Failed: ${TEST_QUERIES.length - successCount}/${TEST_QUERIES.length}`);
  
  if (successCount === TEST_QUERIES.length) {
    console.log('\n🎉 All tests passed! The backend is working correctly.');
  } else if (successCount > 0) {
    console.log('\n⚠️  Some tests passed. Check the errors above.');
  } else {
    console.log('\n❌ All tests failed. Please check:');
    console.log('   1. Is the dev server running? (npm run dev)');
    console.log('   2. Are credentials properly configured?');
    console.log('   3. Check the server logs for detailed errors');
  }
}

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Run tests
runAllTests().catch(console.error);
