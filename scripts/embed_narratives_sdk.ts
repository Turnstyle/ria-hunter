// Using official Vertex AI SDK for embeddings
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';

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

// Initialize Vertex AI
const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = 'us-central1';

if (!projectId) {
  console.error('Error: GOOGLE_PROJECT_ID must be set');
  process.exit(1);
}

console.log(`Using Vertex AI SDK with project: ${projectId}, location: ${location}`);

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: projectId,
  location: location,
});

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    console.log('Trying Vertex AI SDK approach...');
    
    // Try the generative model approach for embeddings
    const model = vertexAI.preview.getGenerativeModel({
      model: 'textembedding-gecko@003',
    });

    // Try to get embeddings using the model
    console.log('Attempting embedding generation...');
    
    // This is a different approach - try to use the embedding endpoint directly
    const request = {
      instances: [
        {
          content: text
        }
      ]
    };

    // Use the predict method
    const result = await model.predict(request);
    console.log('Got result:', JSON.stringify(result, null, 2));
    
    if (result.predictions && result.predictions[0] && result.predictions[0].embeddings) {
      return result.predictions[0].embeddings.values;
    }
    
    throw new Error('No embedding values returned from Vertex AI SDK');
  } catch (error) {
    console.error('Vertex AI SDK error:', error);
    throw error;
  }
}

async function run() {
  console.log(`Starting SDK embedding test for ${LIMIT} narrative(s)...`);
  
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
    
    console.log(`✅ Successfully generated embedding! Vector length: ${embedding.length}`);
    console.log(`First few values: [${embedding.slice(0, 5).join(', ')}...]`);
    
  } catch (error) {
    console.error(`❌ Error processing CRD ${row.crd_number}:`, error);
  }
}

// Run the script
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});