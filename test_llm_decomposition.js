const fetch = require('node-fetch');

async function testDecomposition() {
  console.log('🔍 Testing LLM decomposition for location extraction...\n');

  const baseUrl = 'https://ria-hunter.app';
  const queries = [
    'what are the 10 largest RIAs in St. Louis?',
    'top investment advisors in Missouri',
    'biggest RIAs in Saint Louis, MO',
    'largest firms in St. Louis'
  ];

  for (const query of queries) {
    console.log(`\n📝 Query: "${query}"`);
    console.log('   Making API call...');
    
    try {
      const response = await fetch(`${baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query,
          debug: true // Request debug info if available
        })
      });

      const data = await response.json();
      
      // Check if we have metadata with decomposition info
      if (data.metadata && data.metadata.decomposition) {
        console.log('   ✅ Decomposition successful:');
        console.log(`      Semantic query: ${data.metadata.decomposition.semantic_query}`);
        console.log(`      Location: ${data.metadata.decomposition.structured_filters?.location || 'NOT EXTRACTED'}`);
        console.log(`      Filters applied:`, data.metadata.filters || {});
      } else {
        console.log('   ⚠️ No decomposition metadata in response');
      }
      
      // Check results
      console.log(`   Results: ${data.results?.length || 0} items`);
      if (data.results && data.results.length > 0) {
        console.log('   First 3 locations:');
        data.results.slice(0, 3).forEach(r => {
          console.log(`      - ${r.legal_name || r.firm_name} | ${r.city}, ${r.state}`);
        });
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }
}

testDecomposition();
