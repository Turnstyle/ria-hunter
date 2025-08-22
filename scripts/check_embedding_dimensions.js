// Script to check embedding dimensions
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkEmbeddingDimensions() {
  try {
    console.log('Checking embedding dimensions...');
    
    // Get a sample narrative with embedding
    const { data, error } = await supabase
      .from('narratives')
      .select('embedding')
      .limit(1);
      
    if (error) {
      console.error('Error fetching embedding:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('No narratives with embeddings found');
      return;
    }
    
    console.log(`Embedding type: ${typeof data[0].embedding}`);
    
    // Try to parse the embedding if it's a string
    if (typeof data[0].embedding === 'string') {
      try {
        // Check if it's a JSON string
        const parsed = JSON.parse(data[0].embedding);
        console.log(`Parsed embedding is an array: ${Array.isArray(parsed)}`);
        if (Array.isArray(parsed)) {
          console.log(`Embedding dimensions: ${parsed.length}`);
          console.log(`Sample values: ${parsed.slice(0, 3).join(', ')}...`);
        }
      } catch (e) {
        console.log('Embedding is a string but not valid JSON');
        // Try extracting dimensions from string length
        console.log(`Embedding string length: ${data[0].embedding.length}`);
        
        // Check if it's a base64 encoded string
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        if (base64Regex.test(data[0].embedding)) {
          console.log('Embedding appears to be base64 encoded');
        }
      }
    } else if (Array.isArray(data[0].embedding)) {
      console.log(`Embedding dimensions: ${data[0].embedding.length}`);
      console.log(`Sample values: ${data[0].embedding.slice(0, 3).join(', ')}...`);
    }
    
    // Check for embedding dimensions in migration files
    console.log('\nChecking migration files for embedding dimensions...');
    
    // Try to execute a simple search function to test for vector vs string
    console.log('\nAttempting to execute a similarity search function...');
    try {
      const { data: searchData, error: searchError } = await supabase.rpc(
        'match_documents',
        {
          query_embedding: Array(768).fill(0.1),
          match_threshold: 0.5,
          match_count: 5
        }
      );
      
      if (searchError) {
        console.log(`Search error: ${searchError.message}`);
        // Try with different dimensions
        console.log('Trying with 384 dimensions...');
        const { data: search384Data, error: search384Error } = await supabase.rpc(
          'match_documents',
          {
            query_embedding: Array(384).fill(0.1),
            match_threshold: 0.5,
            match_count: 5
          }
        );
        
        if (search384Error) {
          console.log(`Search error with 384 dimensions: ${search384Error.message}`);
        } else {
          console.log('Search with 384 dimensions succeeded');
        }
      } else {
        console.log('Search succeeded with 768 dimensions');
      }
    } catch (e) {
      console.error('Error executing search function:', e);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkEmbeddingDimensions();
