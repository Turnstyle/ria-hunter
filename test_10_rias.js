// Test asking for 10 St. Louis RIAs to verify all are now available
const test10RIAs = async () => {
  const query = "what are the 10 most active RIA's in St. Louis, MO in terms of private placements?"
  
  try {
    const response = await fetch('https://ria-hunter.app/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        limit: 10
      })
    });
    
    const data = await response.json();
    console.log('Query:', query);
    console.log('Number of sources returned:', data.sources.length);
    console.log('Sources:');
    data.sources.forEach((source, index) => {
      console.log(`${index + 1}. ${source.firm_name} - AUM: $${source.aum.toLocaleString()}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
};

test10RIAs();