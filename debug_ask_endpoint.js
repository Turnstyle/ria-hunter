#!/usr/bin/env node

// Debug the /api/ask endpoint to see where location filtering fails

const fetch = require('node-fetch');

async function debugAskEndpoint() {
  console.log('🔍 Debugging /api/ask endpoint location filtering...\n');
  
  const query = "what are the 10 largest RIAs in St. Louis?";
  
  console.log('Query:', query);
  console.log('Expected: St. Louis, MO results');
  console.log('Actual: Getting global results\n');
  
  // Test 1: Direct /api/ask endpoint
  console.log('1. Testing /api/ask endpoint...');
  try {
    const response = await fetch('https://ria-hunter.app/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    console.log('Results count:', data.results?.length || 0);
    
    if (data.results && data.results.length > 0) {
      console.log('First 3 results:');
      data.results.slice(0, 3).forEach(r => {
        console.log(`  - ${r.firm_name || r.legal_name} | ${r.city}, ${r.state}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  // Test 2: With explicit filters
  console.log('\n2. Testing /api/ask with explicit filters...');
  try {
    const response = await fetch('https://ria-hunter.app/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "largest RIAs",
        filters: { city: "St. Louis", state: "MO" }
      })
    });
    
    const data = await response.json();
    console.log('Results count:', data.results?.length || 0);
    
    if (data.results && data.results.length > 0) {
      console.log('First 3 results:');
      data.results.slice(0, 3).forEach(r => {
        console.log(`  - ${r.firm_name || r.legal_name} | ${r.city}, ${r.state}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  // Test 3: Compare with working /api/ask/search
  console.log('\n3. Testing working /api/ask/search endpoint...');
  try {
    const response = await fetch('https://ria-hunter.app/api/ask/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "largest RIAs",
        filters: { city: "St. Louis", state: "MO" }
      })
    });
    
    const data = await response.json();
    console.log('Results count:', data.results?.length || 0);
    
    if (data.results && data.results.length > 0) {
      console.log('First 3 results:');
      data.results.slice(0, 3).forEach(r => {
        console.log(`  - ${r.legal_name} | ${r.city}, ${r.state} | AUM: $${(r.aum || 0).toLocaleString()}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

debugAskEndpoint();
