#!/usr/bin/env node

require('dotenv').config({ path: './env.local' });

async function testAggregation() {
  console.log('🧪 Testing Edward Jones Aggregation...\n');
  
  const apiUrl = 'http://localhost:3001/api/ask';
  const query = "What are the ten largest RIA firms in St. Louis?";
  
  console.log('📝 Query:', query);
  console.log('🌐 Endpoint:', apiUrl);
  console.log('\n---\n');
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      console.error('❌ API returned error:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ Response received');
    console.log('\n📊 Results:');
    console.log('  - Total Sources:', data.sources?.length || 0);
    
    if (data.sources && data.sources.length > 0) {
      console.log('\n🏆 Top Firms Found:');
      data.sources.forEach((firm, index) => {
        const aumFormatted = firm.aum ? 
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(firm.aum) : 
          'N/A';
        
        console.log(`\n  ${index + 1}. ${firm.legal_name || firm.name || 'Unknown'}`);
        console.log(`     📍 ${firm.city}, ${firm.state}`);
        console.log(`     💰 AUM: ${aumFormatted}`);
        
        // Check if this firm was aggregated
        if (firm.branch_count && firm.branch_count > 1) {
          console.log(`     🏢 Aggregated from ${firm.branch_count} branches`);
          console.log(`     📊 Total aggregated AUM: ${aumFormatted}`);
        }
        
        console.log(`     🆔 CRD: ${firm.crd_number}`);
      });
      
      // Check for Edward Jones specifically
      const edwardJones = data.sources.find(s => 
        s.legal_name?.toLowerCase().includes('edward jones')
      );
      
      if (edwardJones) {
        console.log('\n✅ Edward Jones found with:');
        const aumBillions = (edwardJones.aum / 1000000000).toFixed(2);
        console.log(`  - AUM: $${aumBillions}B`);
        if (edwardJones.branch_count) {
          console.log(`  - Branches aggregated: ${edwardJones.branch_count}`);
        }
        
        // Check if it's close to the expected $2.3T
        const expectedTrillions = 2.3;
        const actualTrillions = edwardJones.aum / 1000000000000;
        
        if (actualTrillions >= expectedTrillions * 0.8) {
          console.log('  - ✅ AUM is close to expected $2.3T');
        } else {
          console.log(`  - ⚠️ AUM ($${actualTrillions.toFixed(2)}T) is lower than expected $${expectedTrillions}T`);
        }
      } else {
        console.log('\n❌ Edward Jones not found in results');
      }
      
      // Count how many unique firms we have
      const uniqueFirms = new Set(data.sources.map(s => s.legal_name?.toLowerCase().trim()));
      console.log(`\n📈 Total unique firms: ${uniqueFirms.size}`);
      
      // Check for "N" entries
      const badEntries = data.sources.filter(s => 
        s.legal_name?.trim() === 'N' || s.legal_name?.trim().toLowerCase() === 'n'
      );
      
      if (badEntries.length > 0) {
        console.log(`\n⚠️ Found ${badEntries.length} bad entries with name "N"`);
      } else {
        console.log('\n✅ No bad entries with name "N" found');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAggregation();
