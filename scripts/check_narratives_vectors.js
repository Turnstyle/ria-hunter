// Script to check narratives table structure and embedding column
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

console.log('Using Supabase URL:', supabaseUrl);
console.log('Using Supabase Anon Key:', supabaseAnonKey ? 'Key provided' : 'No key provided');

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNarrativesVectors() {
  try {
    // Fetch sample data from narratives
    const { data, error } = await supabase
      .from('narratives')
      .select('*')
      .limit(1);
      
    if (error) {
      console.error('Error querying narratives:', error);
      return;
    }
    
    console.log('Narratives table structure:');
    if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
      
      // Check if embedding exists and show its type
      if (data[0].hasOwnProperty('embedding')) {
        console.log('\nEmbedding column exists');
        console.log('Embedding type:', typeof data[0].embedding);
        
        if (typeof data[0].embedding === 'object') {
          console.log('Embedding is an object/array');
          if (Array.isArray(data[0].embedding)) {
            console.log('Embedding is an array with length:', data[0].embedding.length);
          } else {
            console.log('Embedding is an object with keys:', Object.keys(data[0].embedding));
          }
        }
      } else {
        console.log('No embedding column found in narratives table');
      }
      
      // Show sample narrative content
      console.log('\nSample narrative content:');
      console.log(data[0].narrative ? data[0].narrative.substring(0, 300) + '...' : 'No narrative content');
    } else {
      console.log('No data found in narratives table');
    }
    
    // Try to run a vector search query to test if pgvector is working
    console.log('\nAttempting a vector similarity search (if this fails, pgvector may not be set up correctly):');
    try {
      const { data: vectorData, error: vectorError } = await supabase.rpc(
        'match_documents',
        {
          query_embedding: Array(768).fill(0.1), // Mock embedding vector with 768 dimensions
          match_threshold: 0.5,
          match_count: 1
        }
      );
      
      if (vectorError) {
        console.log('Vector search error:', vectorError.message);
      } else {
        console.log('Vector search successful:', vectorData ? 'Results found' : 'No results');
      }
    } catch (vectorErr) {
      console.log('Vector search exception:', vectorErr.message);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkNarrativesVectors();
