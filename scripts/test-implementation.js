const fetch = require('node-fetch')

const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://ria-hunter.app'
  : 'http://localhost:3000'

const TEST_QUERIES = [
  'largest RIA firms in St. Louis',
  'investment advisors specializing in biotech',
  'Edward Jones',
  'RIAs with over $1 billion AUM in California',
  'venture capital focused advisors'
]

async function testSearch(query, cookieHeader = '') {
  console.log(`\n🔍 Testing: "${query}"`)
  
  const response = await fetch(`${BASE_URL}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader
    },
    body: JSON.stringify({ query })
  })
  
  const setCookie = response.headers.get('set-cookie')
  const data = await response.json()
  
  console.log('   Status:', response.status)
  console.log('   Results:', data.sources?.length || 0)
  console.log('   Strategy:', data.metadata?.searchStrategy)
  console.log('   Remaining:', data.metadata?.searchesRemaining)
  console.log('   Has Executives:', data.sources?.[0]?.executives?.length > 0)
  
  if (data.sources?.length > 0) {
    const first = data.sources[0]
    console.log('   Top Result:', first.legal_name, `(${first.city}, ${first.state})`)
    console.log('   Similarity:', first.similarity?.toFixed(3) || 'N/A')
  }
  
  return setCookie || cookieHeader
}

async function testDemoLimits() {
  console.log('\n📊 Testing Demo Limits...')
  let cookie = ''
  
  // Test 6 searches to verify limit at 5
  for (let i = 1; i <= 6; i++) {
    console.log(`\n🧪 Demo Search ${i}/6`)
    
    const response = await fetch(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      },
      body: JSON.stringify({ query: `test query ${i}` })
    })
    
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      cookie = setCookie.split(';')[0]
    }
    
    const data = await response.json()
    console.log('   Status:', response.status)
    console.log('   Remaining:', data.metadata?.searchesRemaining ?? data.searchesRemaining)
    
    if (response.status === 402) {
      console.log('   ✅ Demo limit correctly enforced at search', i)
      break
    }
  }
}

async function testBalanceEndpoint() {
  console.log('\n💰 Testing Balance Endpoint...')
  
  // Test anonymous
  const anonResponse = await fetch(`${BASE_URL}/api/credits/balance`)
  const anonData = await anonResponse.json()
  console.log('   Anonymous Balance:', anonData)
  
  // Test with demo cookie
  const demoResponse = await fetch(`${BASE_URL}/api/credits/balance`, {
    headers: { 'Cookie': 'rh_demo=3' }
  })
  const demoData = await demoResponse.json()
  console.log('   Demo Balance (3 used):', demoData)
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Test Suite')
  console.log('   Environment:', BASE_URL)
  
  // Test regular searches
  for (const query of TEST_QUERIES) {
    await testSearch(query)
    await new Promise(r => setTimeout(r, 1000)) // Rate limit
  }
  
  // Test demo limits
  await testDemoLimits()
  
  // Test balance endpoint
  await testBalanceEndpoint()
  
  console.log('\n✅ All tests complete!')
}

runAllTests().catch(console.error)
