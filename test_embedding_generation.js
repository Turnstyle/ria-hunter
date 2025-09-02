const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Copy the exact same function from the codebase
async function generateVertex768Embedding(text) {
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  
  console.log('🔍 Testing embedding generation...');
  console.log('Project ID:', projectId);
  console.log('Location:', location);
  
  if (!projectId) {
    console.log('❌ No project ID found');
    return null;
  }

  try {
    // Use Application Default Credentials
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const accessToken = await auth.getAccessToken()
    if (!accessToken) {
      console.log('❌ Could not get access token');
      return null;
    }

    console.log('✅ Got access token');

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`
    console.log('URL:', url);
    
    const body = {
      instances: [{ content: text }],
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errText = await response.text()
      console.log('❌ Vertex embedding HTTP error', response.status, errText)
      return null
    }
    const result = await response.json()
    const embedding = result?.predictions?.[0]?.embeddings?.values
    
    if (Array.isArray(embedding)) {
      console.log('✅ SUCCESS! Generated embedding with', embedding.length, 'dimensions');
      return embedding;
    } else {
      console.log('❌ Invalid embedding format:', typeof embedding);
      return null;
    }
  } catch (e) {
    console.log('❌ Vertex embedding failed:', e.message)
    return null
  }
}

// Test it
generateVertex768Embedding('retirement planning financial advisor').then(embedding => {
  if (embedding) {
    console.log('\n🎉 EMBEDDING GENERATION WORKS!');
    console.log('First 5 values:', embedding.slice(0, 5));
    
    // Now test the database function with this embedding
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('\n🔍 Testing database function...');
    return supabase.rpc('match_narratives', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 5
    });
  } else {
    console.log('\n❌ EMBEDDING GENERATION FAILED');
    console.log('This is why semantic search returns 0 confidence');
  }
}).then(result => {
  if (result) {
    if (result.error) {
      console.log('❌ Database function error:', result.error.message);
    } else if (result.data && result.data.length > 0) {
      console.log('✅ DATABASE FUNCTION WORKS!');
      console.log(`Found ${result.data.length} matches`);
      console.log('Top result:', {
        crd: result.data[0].crd_number,
        similarity: result.data[0].similarity,
        name: result.data[0].legal_name
      });
      console.log('\n🎉 SEMANTIC SEARCH SHOULD BE WORKING!');
      console.log('The issue might be in the frontend code calling this function');
    } else {
      console.log('⚠️  Database function works but no matches found');
    }
  }
}).catch(console.error);
