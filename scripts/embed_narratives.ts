// scripts/embed_narratives.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const BATCH = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Vertex AI
const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = 'us-central1';

if (!projectId) {
  console.error('Error: GOOGLE_PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set in environment');
  process.exit(1);
}

const vertex = new VertexAI({ 
  project: projectId,
  location: location 
});

// Get the embedding model
const embeddingModel = vertex.preview.getGenerativeModel({
  model: 'textembedding-gecko@003',
});

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const instances = texts.map(text => ({ content: text }));
    const request = {
      instances,
    };
    
    const result = await embeddingModel.predict(request);
    return result.predictions.map((pred: any) => pred.embeddings.values);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

async function run() {
  console.log(`Starting embedding process with batch size: ${BATCH === 0 ? 'unlimited' : BATCH}`);
  
  // First, ensure the embedding column exists and has the right type
  const { error: schemaError } = await supabase.rpc('exec', {
    sql: `
      DO $$ 
      BEGIN 
        -- Ensure pgvector extension is enabled
        CREATE EXTENSION IF NOT EXISTS vector;
        
        -- Add embedding column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'narratives' 
          AND column_name = 'embedding'
        ) THEN
          ALTER TABLE public.narratives ADD COLUMN embedding vector(768);
        END IF;
      END $$;
    `
  });

  if (schemaError) {
    console.error('Error setting up schema:', schemaError);
    console.log('Note: You may need to run this SQL manually in Supabase:');
    console.log('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('ALTER TABLE public.narratives ADD COLUMN embedding vector(768);');
    return;
  }

  let processedCount = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch rows without embeddings
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, narrative')
      .is('embedding', null)
      .limit(Math.min(BATCH || 500, 500)); // Max 500 per batch for Vertex AI

    if (error) {
      console.error('Error fetching narratives:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('✔ No rows left to process');
      hasMore = false;
      break;
    }

    console.log(`Processing ${data.length} rows...`);

    // Process in smaller sub-batches for Vertex AI (max 5 at a time)
    const subBatchSize = 5;
    for (let i = 0; i < data.length; i += subBatchSize) {
      const subBatch = data.slice(i, i + subBatchSize);
      const texts = subBatch.map(d => d.narrative || '');
      
      try {
        // Generate embeddings
        const embeddings = await generateEmbeddings(texts);
        
        // Prepare update data
        const updates = subBatch.map((row, idx) => ({
          crd_number: row.crd_number,
          embedding: embeddings[idx]
        }));

        // Update the database
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('narratives')
            .update({ embedding: update.embedding })
            .eq('crd_number', update.crd_number);

          if (updateError) {
            console.error(`Error updating CRD ${update.crd_number}:`, updateError);
          }
        }

        processedCount += updates.length;
        console.log(`✔ Processed ${processedCount} rows total`);
      } catch (error) {
        console.error('Error processing batch:', error);
        // Continue with next batch on error
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If we have a limit and have processed enough, stop
    if (BATCH > 0 && processedCount >= BATCH) {
      console.log(`Reached limit of ${BATCH} rows`);
      hasMore = false;
    }
  }

  console.log(`✔ Embedding process complete! Processed ${processedCount} rows total.`);
}

// Run the script
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});