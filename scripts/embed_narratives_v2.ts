// Try newer Vertex AI Embeddings API endpoint
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 1;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Google Auth
const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = 'us-central1';

if (!projectId) {
  console.error('Error: GOOGLE_PROJECT_ID must be set');
  process.exit(1);
}

console.log(`Using project: ${projectId}, location: ${location}`);

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    // Try the newer embedding-specific endpoint
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}:generateEmbeddings`;
    
    const requestBody = {
      model: `projects/${projectId}/locations/${location}/publishers/google/models/textembedding-gecko@003`,
      instances: [
        {
          content: text
        }
      ]
    };

    console.log('Trying newer embeddings API endpoint...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Embeddings API failed: ${response.status}`);
      console.log('Error response:', errorText);
      
      // Try the batch predict endpoint as fallback
      console.log('Trying batch predict endpoint...');
      const batchUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/batchPredictionJobs`;
      
      // This might not work for single prediction, but let's see what error we get
      const batchResponse = await fetch(batchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
        }
      });
      
      console.log('Batch predict endpoint status:', batchResponse.status);
      
      throw new Error(`All endpoints failed. Latest: HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Success! Got response:', JSON.stringify(result, null, 2));
    
    if (result.embeddings && result.embeddings[0] && result.embeddings[0].values) {
      return result.embeddings[0].values;
    }
    
    throw new Error('No embedding values returned from newer API');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function run() {
  console.log(`Testing newer Vertex AI Embeddings API for ${LIMIT} narrative(s)...`);
  
  // Fetch narratives without embeddings (but skip the fake ones)
  const { data, error } = await supabase
    .from('narratives')
    .select('crd_number, narrative')
    .is('embedding', null)
    .limit(LIMIT);

  if (error) {
    console.error('Error fetching narratives:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No narratives without embeddings found');
    return;
  }

  // Test with just the first one
  const row = data[0];
  if (!row.narrative || row.narrative.trim() === '') {
    console.log(`Skipping empty narrative for CRD ${row.crd_number}`);
    return;
  }

  try {
    console.log(`Testing CRD ${row.crd_number}...`);
    console.log(`Narrative preview: ${row.narrative.substring(0, 100)}...`);
    
    // Generate embedding
    const embedding = await generateEmbedding(row.narrative);
    
    console.log(`✅ SUCCESS! Generated embedding! Vector length: ${embedding.length}`);
    console.log(`First few values: [${embedding.slice(0, 5).join(', ')}...]`);
    
  } catch (error) {
    console.error(`❌ Error processing CRD ${row.crd_number}:`, error.message);
  }
}

// Run the script
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});