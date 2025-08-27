/**
 * Comprehensive Backend Endpoint Testing
 * Tests all critical API endpoints for the RIA Hunter app
 */

const BASE_URL = process.env.BASE_URL || 'https://ria-hunter.app';

// Test utilities
function logTest(testName, status, details) {
  const icon = status === 'SUCCESS' ? '✅' : status === 'FAILED' ? '❌' : '⚠️';
  console.log(`\n${icon} ${testName}`);
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

// Test session tracking
async function testSessionStatus() {
  console.log('\n=== Testing /api/session/status ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/session/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      logTest('GET /api/session/status', 'SUCCESS', {
        status: response.status,
        searchesRemaining: data.searchesRemaining,
        searchesUsed: data.searchesUsed,
        isAuthenticated: data.isAuthenticated
      });
      return data;
    } else {
      logTest('GET /api/session/status', 'FAILED', {
        status: response.status,
        error: data.error
      });
      return null;
    }
  } catch (error) {
    logTest('GET /api/session/status', 'FAILED', {
      error: error.message
    });
    return null;
  }
}

// Test main ask endpoint
async function testAskEndpoint(query, cookies) {
  console.log('\n=== Testing /api/ask ===');
  console.log(`Query: "${query}"`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Include cookies if available (for session tracking)
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    const response = await fetch(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      credentials: 'include'
    });
    
    // Capture cookies from response
    const setCookie = response.headers.get('set-cookie');
    
    const data = await response.json();
    
    if (response.ok) {
      logTest('POST /api/ask', 'SUCCESS', {
        status: response.status,
        answerLength: data.answer?.length,
        sourcesCount: data.sources?.length,
        searchStrategy: data.metadata?.searchStrategy,
        queryType: data.metadata?.queryType,
        confidence: data.metadata?.confidence,
        searchesRemaining: data.metadata?.searchesRemaining,
        searchesUsed: data.metadata?.searchesUsed,
        setCookie: setCookie ? 'Cookie was set' : 'No cookie'
      });
      
      // Display first 200 chars of answer
      if (data.answer) {
        console.log('\n   Answer preview:', data.answer.substring(0, 200) + '...');
      }
      
      // Display first source
      if (data.sources && data.sources.length > 0) {
        console.log('\n   First source:', {
          legal_name: data.sources[0].legal_name,
          city: data.sources[0].city,
          state: data.sources[0].state,
          aum: data.sources[0].aum,
          similarity: data.sources[0].similarity
        });
      }
      
      return { data, setCookie };
    } else {
      logTest('POST /api/ask', 'FAILED', {
        status: response.status,
        error: data.error,
        code: data.code,
        upgradeRequired: data.upgradeRequired
      });
      return null;
    }
  } catch (error) {
    logTest('POST /api/ask', 'FAILED', {
      error: error.message
    });
    return null;
  }
}

// Test streaming endpoint
async function testAskStreamEndpoint(query, cookies) {
  console.log('\n=== Testing /api/ask-stream ===');
  console.log(`Query: "${query}"`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    const response = await fetch(`${BASE_URL}/api/ask-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      const text = await response.text();
      logTest('POST /api/ask-stream', 'FAILED', {
        status: response.status,
        error: text
      });
      return null;
    }
    
    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let tokenCount = 0;
    let metadata = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            console.log('   Stream completed');
          } else if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                fullText += parsed.token;
                tokenCount++;
              }
              if (parsed.metadata) {
                metadata = parsed.metadata;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }
    
    logTest('POST /api/ask-stream', 'SUCCESS', {
      status: response.status,
      totalTokens: tokenCount,
      responseLength: fullText.length,
      metadata
    });
    
    console.log('\n   Stream preview:', fullText.substring(0, 200) + '...');
    
    return { fullText, metadata };
  } catch (error) {
    logTest('POST /api/ask-stream', 'FAILED', {
      error: error.message
    });
    return null;
  }
}

// Test search counter decrementing
async function testSearchCounterFlow() {
  console.log('\n\n🔍 === TESTING SEARCH COUNTER FLOW ===\n');
  
  // 1. Get initial session status
  console.log('Step 1: Check initial session status');
  const initialStatus = await testSessionStatus();
  
  if (!initialStatus) {
    console.log('❌ Failed to get initial status');
    return;
  }
  
  const initialCount = initialStatus.searchesUsed;
  const initialRemaining = initialStatus.searchesRemaining;
  
  console.log(`\n📊 Initial state: ${initialCount} used, ${initialRemaining} remaining`);
  
  // 2. Make a search query
  console.log('\nStep 2: Execute a search query');
  const result = await testAskEndpoint('Show me the largest RIAs in St. Louis', null);
  
  if (!result) {
    console.log('❌ Failed to execute search');
    return;
  }
  
  // 3. Check session status after search
  console.log('\nStep 3: Check session status after search');
  const afterStatus = await testSessionStatus();
  
  if (!afterStatus) {
    console.log('❌ Failed to get status after search');
    return;
  }
  
  const afterCount = afterStatus.searchesUsed;
  const afterRemaining = afterStatus.searchesRemaining;
  
  console.log(`\n📊 After search: ${afterCount} used, ${afterRemaining} remaining`);
  
  // 4. Verify counter changed
  if (afterCount > initialCount) {
    console.log(`\n✅ SUCCESS: Counter incremented from ${initialCount} to ${afterCount}`);
  } else if (afterCount === initialCount && initialRemaining === -1) {
    console.log(`\n✅ SUCCESS: User has unlimited searches (subscriber)`);
  } else {
    console.log(`\n❌ FAILED: Counter did not increment! Still at ${afterCount}`);
  }
  
  // 5. Test streaming endpoint with counter
  console.log('\nStep 4: Test streaming endpoint');
  const streamResult = await testAskStreamEndpoint('What are the top RIAs in New York?', null);
  
  if (streamResult && streamResult.metadata) {
    console.log('\n📊 Stream metadata:', {
      searchesRemaining: streamResult.metadata.remaining,
      isSubscriber: streamResult.metadata.isSubscriber
    });
  }
}

// Main test runner
async function runAllTests() {
  console.log('========================================');
  console.log('    RIA Hunter Backend Endpoint Tests   ');
  console.log('========================================');
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
  
  // Run the comprehensive counter flow test
  await testSearchCounterFlow();
  
  console.log('\n\n========================================');
  console.log('           TEST RUN COMPLETE            ');
  console.log('========================================\n');
}

// Execute tests
runAllTests().catch(console.error);