#!/usr/bin/env node

/**
 * Test script to verify semantic search is working correctly
 * Tests the St. Louis query that was returning boilerplate results
 */

require('dotenv').config({ path: './env.local' });

async function testSemanticSearch() {
  console.log('🧪 Testing Semantic Search Fix...\n');
  
  // Test the /api/ask endpoint
  const apiUrl = 'http://localhost:3000/api/ask';
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
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }
    
    const data = await response.json();
    
    // Check if we got real results
    console.log('✅ Response received');
    console.log('\n📊 Metadata:');
    console.log('  - Search Strategy:', data.metadata?.searchStrategy);
    console.log('  - Query Type:', data.metadata?.queryType);
    console.log('  - Confidence:', data.metadata?.confidence);
    console.log('  - Request ID:', data.metadata?.requestId);
    
    console.log('\n📈 Results Summary:');
    console.log('  - Total Sources:', data.sources?.length || 0);
    
    if (data.sources && data.sources.length > 0) {
      console.log('\n🏆 Top 10 RIAs Found:');
      data.sources.slice(0, 10).forEach((firm, index) => {
        const aumFormatted = firm.aum ? 
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(firm.aum) : 
          'N/A';
        
        console.log(`\n  ${index + 1}. ${firm.legal_name || firm.name || 'Unknown'}`);
        console.log(`     📍 ${firm.city}, ${firm.state}`);
        console.log(`     💰 AUM: ${aumFormatted}`);
        console.log(`     🏢 CRD: ${firm.crd_number}`);
        
        if (firm.executives && firm.executives.length > 0) {
          console.log(`     👥 Executives: ${firm.executives.slice(0, 3).map(e => e.name).join(', ')}`);
        }
        
        if (firm.similarity) {
          console.log(`     🎯 Similarity: ${(firm.similarity * 100).toFixed(1)}%`);
        }
      });
    }
    
    // Check for specific firms we expect (Edward Jones, Stifel)
    console.log('\n🔍 Checking for Expected Firms:');
    const expectedFirms = ['Edward Jones', 'Stifel', 'Benjamin F. Edwards'];
    expectedFirms.forEach(name => {
      const found = data.sources?.find(s => 
        s.legal_name?.toLowerCase().includes(name.toLowerCase()) || 
        s.name?.toLowerCase().includes(name.toLowerCase())
      );
      console.log(`  - ${name}: ${found ? '✅ Found' : '❌ Missing'}`);
    });
    
    // Check if answer is boilerplate
    console.log('\n📝 Answer Analysis:');
    const answer = data.answer || '';
    const boilerplatePhrases = [
      'Based on the provided context',
      'I don\'t have specific information',
      'The context doesn\'t include',
      'I cannot provide specific data',
      'I would need more information'
    ];
    
    const isBoilerplate = boilerplatePhrases.some(phrase => 
      answer.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (isBoilerplate) {
      console.log('  ⚠️  WARNING: Answer appears to be boilerplate!');
      console.log('  First 200 chars:', answer.substring(0, 200) + '...');
    } else {
      console.log('  ✅ Answer appears to contain real data');
      console.log('  First 500 chars:', answer.substring(0, 500) + '...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Check if Next.js server is running
async function checkServerRunning() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServerRunning();
  
  if (!serverRunning) {
    console.log('⚠️  Next.js server is not running on localhost:3000');
    console.log('Please start the server first with: npm run dev');
    process.exit(1);
  }
  
  await testSemanticSearch();
}

main().catch(console.error);
