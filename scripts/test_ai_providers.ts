#!/usr/bin/env npx tsx

/**
 * Test script to verify AI provider switching functionality
 */

const API_URL = 'http://localhost:3000';

interface TestQuery {
  query: string;
  description: string;
}

const testQueries: TestQuery[] = [
  {
    query: "What is the largest RIA in California?",
    description: "Superlative query test"
  },
  {
    query: "How many RIAs are in New York?", 
    description: "Count query test"
  }
];

async function testProvider(provider: 'openai' | 'vertex', query: string): Promise<any> {
  const response = await fetch(`${API_URL}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      aiProvider: provider
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

async function runTests() {
  console.log('🚀 Testing AI Provider Switching...\n');

  for (const testQuery of testQueries) {
    console.log(`📝 ${testQuery.description}`);
    console.log(`   Query: "${testQuery.query}"`);
    
    // Test OpenAI
    try {
      console.log('   🤖 Testing with OpenAI...');
      const openaiResult = await testProvider('openai', testQuery.query);
      console.log(`   ✅ OpenAI Response: ${openaiResult.answer.substring(0, 100)}...`);
      console.log(`   📊 Sources: ${openaiResult.sources.length} firms`);
    } catch (error) {
      console.log(`   ❌ OpenAI Error: ${error}`);
    }

    // Test Vertex AI (will likely fail due to billing, but should gracefully fallback)
    try {
      console.log('   🧠 Testing with Vertex AI...');
      const vertexResult = await testProvider('vertex', testQuery.query);
      console.log(`   ✅ Vertex AI Response: ${vertexResult.answer.substring(0, 100)}...`);
      console.log(`   📊 Sources: ${vertexResult.sources.length} firms`);
    } catch (error) {
      console.log(`   ❌ Vertex AI Error: ${error}`);
    }

    console.log('');
  }

  // Test default provider (should use environment variable)
  console.log('🔧 Testing default provider (from environment)...');
  try {
    const response = await fetch(`${API_URL}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "What is the largest RIA in Florida?"
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Default provider response: ${result.answer.substring(0, 100)}...`);
    } else {
      console.log(`❌ Default provider error: HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Default provider error: ${error}`);
  }

  console.log('\n✅ AI Provider switching tests completed!');
}

// Run the tests
runTests().catch(console.error);