/**
 * Test script to verify semantic search is actually working
 * This will help determine if the backend is using AI or just structured queries
 */

require('dotenv').config({ path: './env.local' });

const BASE_URL = 'https://ria-hunter.app/_backend/api';

// Test queries - some should trigger semantic search, others structured
const testQueries = [
  {
    query: "Show me the largest RIAs in St. Louis",
    expectedType: "superlative",
    shouldUseSemantic: false  // This is a superlative query, may use direct DB
  },
  {
    query: "RIAs specializing in retirement planning and 401k management",
    expectedType: "semantic",
    shouldUseSemantic: true  // This should trigger semantic search
  },
  {
    query: "Investment advisors focused on ESG investing",
    expectedType: "semantic", 
    shouldUseSemantic: true  // This should trigger semantic search
  },
  {
    query: "RIAs with expertise in cryptocurrency and digital assets",
    expectedType: "semantic",
    shouldUseSemantic: true  // This should trigger semantic search
  },
  {
    query: "Find advisors who work with high net worth individuals",
    expectedType: "semantic",
    shouldUseSemantic: true  // This should trigger semantic search
  }
];

async function testQuery(testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: "${testCase.query}"`);
  console.log(`Expected: ${testCase.expectedType}, Should use semantic: ${testCase.shouldUseSemantic}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const response = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: testCase.query })
    });
    
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    
    // Check metadata
    const metadata = data.metadata || {};
    console.log('\n📊 Metadata:');
    console.log(`   - Search Strategy: ${metadata.searchStrategy || 'UNKNOWN'}`);
    console.log(`   - Query Type: ${metadata.queryType || 'UNKNOWN'}`);
    console.log(`   - Confidence: ${metadata.confidence || 'N/A'}`);
    
    // Check if semantic search was used
    const usedSemantic = metadata.searchStrategy?.includes('semantic');
    
    // Check sources
    const sources = data.sources || [];
    console.log(`\n🔍 Results:`);
    console.log(`   - Found ${sources.length} sources`);
    
    if (sources.length > 0) {
      const firstSource = sources[0];
      console.log(`   - First result: ${firstSource.legal_name}`);
      console.log(`   - Similarity score: ${firstSource.similarity || 'N/A'}`);
      console.log(`   - Source type: ${firstSource.source || 'UNKNOWN'}`);
    }
    
    // Validate expectations
    console.log('\n✅ Validation:');
    if (testCase.shouldUseSemantic && !usedSemantic) {
      console.log(`   ⚠️ WARNING: Expected semantic search but got ${metadata.searchStrategy}`);
    } else if (!testCase.shouldUseSemantic && usedSemantic) {
      console.log(`   ℹ️ INFO: Used semantic search when not expected (this is fine)`);
    } else {
      console.log(`   ✓ Search strategy matches expectation`);
    }
    
    // Check for fallback patterns
    if (metadata.searchStrategy?.includes('fallback') || 
        metadata.searchStrategy?.includes('structured') ||
        firstSource?.source?.includes('fallback')) {
      console.log(`   ⚠️ FALLBACK DETECTED: System fell back to structured search`);
      console.log(`      This likely means semantic search failed!`);
    }
    
    // Check decomposition if available
    if (metadata.decomposition) {
      console.log('\n📝 Query Decomposition:');
      console.log(`   - Semantic query: "${metadata.decomposition.semantic_query || 'N/A'}"`);
      if (metadata.decomposition.structured_filters) {
        console.log(`   - Filters:`, JSON.stringify(metadata.decomposition.structured_filters));
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('🧪 TESTING SEMANTIC SEARCH FUNCTIONALITY');
  console.log('=========================================\n');
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  for (const testCase of testQueries) {
    await testQuery(testCase);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n\n🏁 TEST SUMMARY');
  console.log('===============');
  console.log('If you see:');
  console.log('- "semantic-first" → AI embeddings are working ✅');
  console.log('- "structured-fallback" → AI failed, using DB only ❌');
  console.log('- "direct-superlative" → Expected for "largest" queries ✅');
  console.log('\nKey indicators of problems:');
  console.log('- All queries showing "structured-fallback"');
  console.log('- No similarity scores');
  console.log('- Missing confidence scores');
}

// Run the tests
runTests().catch(console.error);
