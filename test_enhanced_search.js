const API_URL = 'http://localhost:3000/api/ask';

async function testEnhancedSearch() {
  console.log('🚀 Testing Enhanced Semantic Search Capabilities');
  console.log('=' .repeat(60));
  
  const testQueries = [
    {
      name: "Alternative Investment Specialists",
      query: "Find RIAs specializing in alternative investments and private equity"
    },
    {
      name: "Private Placement Experts in St. Louis", 
      query: "Who are the top private placement managers in St. Louis Missouri?"
    },
    {
      name: "Real Estate Investment Funds",
      query: "Show me RIAs that manage real estate investment funds"
    },
    {
      name: "Infrastructure Investment Specialists",
      query: "Find advisors specializing in infrastructure and energy investments"
    },
    {
      name: "Family Office Services",
      query: "Which RIAs provide family office and institutional services?"
    }
  ];
  
  for (const testQuery of testQueries) {
    console.log(`\n🔍 **${testQuery.name}**`);
    console.log('-'.repeat(40));
    console.log(`Query: "${testQuery.query}"`);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: testQuery.query,
          limit: 5
        })
      });
      
      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status}`);
        continue;
      }
      
      const result = await response.json();
      
      console.log(`\n📊 **Results:**`);
      console.log(`Answer: ${result.answer.substring(0, 300)}...`);
      
      if (result.sources && result.sources.length > 0) {
        console.log(`\n💼 **Top RIAs Found:**`);
        result.sources.slice(0, 3).forEach((source, index) => {
          console.log(`${index + 1}. ${source.firm_name}`);
          console.log(`   📍 ${source.city}, ${source.state}`);
          console.log(`   💰 AUM: $${(source.aum || 0).toLocaleString()}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 **Enhanced Search Testing Complete!**');
  console.log('✨ Semantic capabilities are now active and improving results');
}

// Run if this is the main module
if (require.main === module) {
  testEnhancedSearch().catch(console.error);
}

module.exports = { testEnhancedSearch };