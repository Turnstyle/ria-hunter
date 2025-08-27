#!/usr/bin/env node

/**
 * Test script for backend API endpoints
 * Tests the session/status, ask, and ask-stream endpoints
 */

const https = require('https');
const http = require('http');

// Configuration - update this for your environment
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const isHTTPS = BASE_URL.startsWith('https');
const httpModule = isHTTPS ? https : http;

// Parse URL
const url = new URL(BASE_URL);

/**
 * Make HTTP request
 */
function makeRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHTTPS ? 443 : 80),
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      }
    };

    console.log(`\n📡 ${method} ${BASE_URL}${path}`);
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Headers:`, res.headers);
        
        try {
          const parsed = JSON.parse(data);
          console.log(`   Response:`, JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          console.log(`   Response (raw):`, data);
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('   Error:', error.message);
      reject(error);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Test streaming endpoint
 */
function testStreaming(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHTTPS ? 443 : 80),
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers
      }
    };

    console.log(`\n📡 POST ${BASE_URL}${path} (streaming)`);
    
    const req = httpModule.request(options, (res) => {
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Headers:`, res.headers);
      console.log(`   Streaming response:`);
      
      let fullResponse = '';
      
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        fullResponse += chunkStr;
        
        // Parse SSE format
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              console.log('   [Stream Complete]');
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.token) {
                  process.stdout.write(parsed.token);
                } else {
                  console.log(`\n   [Event]:`, parsed);
                }
              } catch (e) {
                console.log(`   [Raw]:`, data);
              }
            }
          }
        }
      });
      
      res.on('end', () => {
        console.log('\n   [Connection closed]');
        resolve({ status: res.statusCode, headers: res.headers });
      });
    });
    
    req.on('error', (error) => {
      console.error('   Error:', error.message);
      reject(error);
    });
    
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Testing Backend API Endpoints');
  console.log('================================');
  console.log(`Base URL: ${BASE_URL}`);
  
  try {
    // Test 1: Session Status (Anonymous)
    console.log('\n\n1️⃣  Testing /api/session/status (anonymous)');
    console.log('--------------------------------------------');
    const sessionResult = await makeRequest('/api/session/status');
    console.log('✅ Session status test complete');
    
    // Test 2: Session Status (With fake auth token)
    console.log('\n\n2️⃣  Testing /api/session/status (with auth header)');
    console.log('---------------------------------------------------');
    const authSessionResult = await makeRequest('/api/session/status', 'GET', null, {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.test'
    });
    console.log('✅ Authenticated session status test complete');
    
    // Test 3: Ask endpoint (non-streaming)
    console.log('\n\n3️⃣  Testing /api/ask (non-streaming)');
    console.log('-------------------------------------');
    const askResult = await makeRequest('/api/ask', 'POST', {
      query: 'What are the largest RIA firms in New York?'
    });
    console.log('✅ Ask endpoint test complete');
    
    // Test 4: Ask-stream endpoint
    console.log('\n\n4️⃣  Testing /api/ask-stream (streaming)');
    console.log('----------------------------------------');
    await testStreaming('/api/ask-stream', {
      query: 'What are the top 3 investment advisers in California?'
    });
    console.log('✅ Streaming endpoint test complete');
    
    // Test 5: Check if searches decrement
    console.log('\n\n5️⃣  Testing search count decrement');
    console.log('-----------------------------------');
    const sessionAfter = await makeRequest('/api/session/status');
    console.log('✅ Search count check complete');
    
    console.log('\n\n✨ All tests completed!');
    console.log('=======================\n');
    
  } catch (error) {
    console.error('\n\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
