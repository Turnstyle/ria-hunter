// Test if STIFEL is accessible via API
const testStifel = async () => {
  const query = "Tell me about Stifel Nicolaus"
  
  try {
    const response = await fetch('https://ria-hunter.app/api/ask', {
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
    console.log('STIFEL Query Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
};

testStifel();