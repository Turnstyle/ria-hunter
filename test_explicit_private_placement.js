// Test with very explicit private placement terminology
const testExplicit = async () => {
  const query = "Show me RIAs with the most private funds in St. Louis"
  
  try {
    const response = await fetch('https://ria-hunter-app.vercel.app/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        limit: 5
      })
    });
    
    const data = await response.json();
    console.log('Explicit Private Fund Query Response:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
};

testExplicit();