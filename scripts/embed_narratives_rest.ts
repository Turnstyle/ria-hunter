// Embedding script using REST API for Vertex AI Text Embeddings
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10;

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

    // Try different model versions and formats
    const modelVersions = [
      'text-embedding-preview-0409',
      'text-multilingual-embedding-preview-0409',
      'textembedding-gecko@003',
      'textembedding-gecko@002',
      'textembedding-gecko@001',
      'textembedding-gecko'
    ];
    
    let lastError;
    for (const modelVersion of modelVersions) {
      try {
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelVersion}:predict`;
        console.log(`Trying model: ${modelVersion}`);
    
    const requestBody = {
      instances: [{ content: text }]
    };

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
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          console.log(`Model ${modelVersion} failed: ${response.status}`);
          continue;
        }

        const result = await response.json();
        
        if (result.predictions && result.predictions[0] && result.predictions[0].embeddings) {
          console.log(`✓ Successfully used model: ${modelVersion}`);
          return result.predictions[0].embeddings.values;
        }
        
        lastError = new Error('No embedding values returned from Vertex AI API');
      } catch (error) {
        lastError = error;
        console.log(`Model ${modelVersion} error:`, error.message);
        continue;
      }
    }
    
    throw lastError || new Error('All model versions failed');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function run() {
  console.log(`Starting embedding process for up to ${LIMIT} narratives...`);
  
  // Fetch narratives without embeddings
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

  console.log(`Found ${data.length} narratives to process`);

  let processed = 0;
  let errors = 0;

  // Process one at a time to avoid rate limits
  for (const row of data) {
    if (!row.narrative || row.narrative.trim() === '') {
      console.log(`Skipping empty narrative for CRD ${row.crd_number}`);
      continue;
    }

    try {
      console.log(`Processing CRD ${row.crd_number}...`);
      
      // Generate embedding
      const embedding = await generateEmbedding(row.narrative);
      
      // Update the database
      const { error: updateError } = await supabase
        .from('narratives')
        .update({ embedding })
        .eq('crd_number', row.crd_number);

      if (updateError) {
        console.error(`Error updating CRD ${row.crd_number}:`, updateError);
        errors++;
      } else {
        processed++;
        console.log(`✓ Embedded narrative for CRD ${row.crd_number} (${processed}/${data.length})`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error processing CRD ${row.crd_number}:`, error);
      errors++;
    }
  }

  console.log(`\nEmbedding process complete!`);
  console.log(`✓ Successfully processed: ${processed}`);
  console.log(`✗ Errors: ${errors}`);
}

// Run the script
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});