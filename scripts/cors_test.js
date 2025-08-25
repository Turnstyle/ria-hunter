/**
 * CORS Test Script for RIA Hunter API
 * This script tests CORS behavior in production for all API endpoints
 * 
 * Usage:
 * node scripts/cors_test.js
 */

const fetch = require('node-fetch');

// Target environments to test
const ENVIRONMENTS = [
  {
    name: 'Production',
    baseUrl: 'https://ria-hunter.vercel.app',
    expectedOrigin: 'https://www.ria-hunter.app'
  },
  {
    name: 'Development',
    baseUrl: 'http://localhost:3001',
    expectedOrigin: 'http://localhost:3000'
  }
];

// Endpoints to test
const ENDPOINTS = [
  { path: '/api/ask-stream', method: 'OPTIONS' },
  { path: '/api/ask-stream', method: 'POST', body: { query: 'test query' } },
  { path: '/api/ask', method: 'OPTIONS' },
  { path: '/api/ask', method: 'POST', body: { query: 'test query' } },
  { path: '/api/subscription-status', method: 'OPTIONS' },
  { path: '/api/subscription-status', method: 'GET' }
];

// Run all tests
async function runTests() {
  console.log('🔍 Starting CORS Tests');
  console.log('====================\n');

  for (const env of ENVIRONMENTS) {
    console.log(`Testing ${env.name} Environment: ${env.baseUrl}`);
    console.log('-------------------------------------');

    for (const endpoint of ENDPOINTS) {
      await testEndpoint(env, endpoint);
    }
    console.log('\n');
  }

  console.log('✅ Tests completed');
}

async function testEndpoint(env, endpoint) {
  const url = `${env.baseUrl}${endpoint.path}`;
  const options = {
    method: endpoint.method,
    headers: {
      'Origin': env.expectedOrigin,
      'Content-Type': 'application/json',
      'Accept': endpoint.path.includes('stream') ? 'text/event-stream' : 'application/json'
    }
  };

  if (endpoint.body && endpoint.method !== 'GET' && endpoint.method !== 'OPTIONS') {
    options.body = JSON.stringify(endpoint.body);
  }

  try {
    console.log(`\nTesting ${endpoint.method} ${endpoint.path}`);
    const response = await fetch(url, options);
    
    // Extract and validate CORS headers
    const corsHeaders = {
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-credentials': response.headers.get('access-control-allow-credentials'),
      'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
      'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
      'vary': response.headers.get('vary')
    };

    console.log(`Status: ${response.status}`);
    console.log('CORS Headers:');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      console.log(`  ${key}: ${value || 'not set'}`);
    });

    // Run validations
    const hasValidOrigin = corsHeaders['access-control-allow-origin'] === env.expectedOrigin;
    const hasCredentials = corsHeaders['access-control-allow-credentials'] === 'true';
    const hasVary = corsHeaders['vary']?.includes('Origin');
    
    if (endpoint.method === 'OPTIONS') {
      const hasMethods = corsHeaders['access-control-allow-methods']?.includes('POST');
      const hasHeaders = corsHeaders['access-control-allow-headers']?.includes('Content-Type');
      
      console.log('\nValidation:');
      console.log(`  ✓ Status 204: ${response.status === 204}`);
      console.log(`  ✓ Valid Origin: ${hasValidOrigin}`);
      console.log(`  ✓ Allow Credentials: ${hasCredentials}`);
      console.log(`  ✓ Has Methods: ${!!hasMethods}`);
      console.log(`  ✓ Has Headers: ${!!hasHeaders}`);
      console.log(`  ✓ Has Vary: ${!!hasVary}`);
    } else if (endpoint.path.includes('stream') && endpoint.method === 'POST') {
      const contentType = response.headers.get('content-type');
      const cacheControl = response.headers.get('cache-control');
      const connection = response.headers.get('connection');
      const noBuffering = response.headers.get('x-accel-buffering');

      console.log('\nSSE Headers:');
      console.log(`  Content-Type: ${contentType || 'not set'}`);
      console.log(`  Cache-Control: ${cacheControl || 'not set'}`);
      console.log(`  Connection: ${connection || 'not set'}`);
      console.log(`  X-Accel-Buffering: ${noBuffering || 'not set'}`);
      
      console.log('\nValidation:');
      console.log(`  ✓ Valid Origin: ${hasValidOrigin}`);
      console.log(`  ✓ Allow Credentials: ${hasCredentials}`);
      console.log(`  ✓ Has Vary: ${!!hasVary}`);
      console.log(`  ✓ Is SSE: ${contentType?.includes('text/event-stream')}`);
      console.log(`  ✓ No Caching: ${cacheControl?.includes('no-cache')}`);
      console.log(`  ✓ Keep Alive: ${connection === 'keep-alive'}`);
      console.log(`  ✓ No Buffering: ${noBuffering === 'no'}`);
    } else {
      console.log('\nValidation:');
      console.log(`  ✓ Valid Origin: ${hasValidOrigin}`);
      console.log(`  ✓ Allow Credentials: ${hasCredentials}`);
      console.log(`  ✓ Has Vary: ${!!hasVary}`);
    }

  } catch (error) {
    console.error(`❌ Error testing ${endpoint.method} ${endpoint.path}:`, error.message);
  }
}

// Run the tests
runTests().catch(console.error);
