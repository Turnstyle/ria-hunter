// Quick test script for private placement API
const testQuery = async () => {
  const query = "what are the top 5 RIA's for private placements in St. Louis, MO?"
  
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
    console.log('Query:', query);
    console.log('Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
};

testQuery();