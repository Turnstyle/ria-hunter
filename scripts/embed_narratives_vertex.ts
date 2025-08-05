// Working embedding script for narratives using Vertex AI Text Embeddings API
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

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

console.log(`Initializing Vertex AI with project: ${projectId}, location: ${location}`);

const vertex = new VertexAI({ 
  project: projectId,
  location: location 
});

// Use the correct approach for embeddings based on the documentation
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Use the predict method on the embeddings model endpoint
    const request = {
      instances: [{ content: text }]
    };
    
    // Make a prediction request to the textembedding-gecko model
    const response = await vertex.predict({
      endpoint: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/textembedding-gecko@003:predict`,
      instances: request.instances
    });
    
    if (response.predictions && response.predictions[0] && response.predictions[0].embeddings) {
      return response.predictions[0].embeddings.values;
    }
    
    throw new Error('No embedding values returned from Vertex AI');
  } catch (error) {
    console.error('Error generating embedding:', error);
    
    // Try using a different approach with VertexAI Text Embeddings API
    try {
      const embeddingModel = vertex.getGenerativeModel({
        model: 'textembedding-gecko@003'
      });
      
      // Try the embedContent method
      const result = await embeddingModel.embedContent({
        content: { role: 'user', parts: [{ text: text }] }
      });
      
      if (result.embedding && result.embedding.values) {
        return result.embedding.values;
      }
      
      throw new Error('No embedding values from embedContent method');
    } catch (secondError) {
      console.error('Secondary approach also failed:', secondError);
      throw secondError;
    }
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