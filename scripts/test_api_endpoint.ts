/**
 * Test script for the /api/ask endpoint
 * Run with: npx tsx scripts/test_api_endpoint.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  query: string;
  expectedBehavior: string;
}

const testCases: TestCase[] = [
  {
    name: "Largest RIA in Missouri",
    query: "What is the largest RIA in Missouri?",
    expectedBehavior: "Should return a single firm in Missouri with the highest AUM"
  },
  {
    name: "Top 5 RIAs in California",
    query: "Show me the top 5 RIAs in California",
    expectedBehavior: "Should return 5 firms in CA ordered by AUM descending"
  },
  {
    name: "Count query",
    query: "How many RIAs are there in Texas?",
    expectedBehavior: "Should return a count of firms in TX"
  },
  {
    name: "Specific firm query",
    query: "Tell me about Fisher Investments",
    expectedBehavior: "Should return information about Fisher Investments if it exists"
  },
  {
    name: "Investment focus query",
    query: "Which RIAs specialize in sustainable investing?",
    expectedBehavior: "Should search narratives for sustainable/ESG focus (once embeddings are ready)"
  }
];

async function testEndpoint(testCase: TestCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`   Query: "${testCase.query}"`);
  console.log(`   Expected: ${testCase.expectedBehavior}`);
  
  try {
    const response = await fetch(`${API_URL}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: testCase.query }),
    });

    if (!response.ok) {
      console.error(`   ❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    
    console.log(`   ✅ Response received:`);
    console.log(`   Answer: ${data.answer?.substring(0, 200)}...`);
    console.log(`   Sources: ${data.sources?.length || 0} firms returned`);
    
    if (data.sources && data.sources.length > 0) {
      console.log(`   First source: ${data.sources[0].firm_name} (${data.sources[0].state}) - AUM: $${data.sources[0].aum?.toLocaleString() || 'N/A'}`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error}`);
  }
}

async function runTests() {
  console.log('🚀 Starting API endpoint tests...\n');
  console.log(`   API URL: ${API_URL}`);
  
  for (const testCase of testCases) {
    await testEndpoint(testCase);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ All tests completed!');
}

// Run the tests
runTests().catch(console.error);