/**
 * Custom Embedding Script for RIA Narratives
 * 
 * This script generates vector embeddings for narratives in the narratives table
 * to enable semantic search capabilities using pgvector in Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

/**
 * Generate embedding for a given text using OpenAI (simulated)
 * In a real implementation, you would use OpenAI, Google Vertex AI, or another embedding service
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // For now, we'll create a simple placeholder embedding
    // In production, you would use a real embedding service like:
    // - OpenAI's text-embedding-ada-002
    // - Google's textembedding-gecko
    // - Sentence Transformers
    
    console.log(`Generating embedding for text: ${text.substring(0, 50)}...`);
    
    // Create a deterministic but random-looking embedding based on text content
    const hash = text.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    // Generate 384-dimensional embedding (matching our schema)
    const embedding = Array.from({ length: 384 }, (_, i) => {
      return Math.sin(hash * (i + 1) * 0.01) * 0.1 + Math.cos(hash * (i + 1) * 0.02) * 0.1;
    });
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Main function to process all narratives
 */
async function processAllNarratives() {
  console.log('Starting narrative embedding process...');

  // Fetch all narratives without embeddings
  const { data: narratives, error: fetchError } = await supabase
    .from('narratives')
    .select('crd_number, narrative')
    .is('embedding', null)
    .limit(1000); // Process in chunks to avoid memory issues

  if (fetchError) {
    console.error('Error fetching narratives:', fetchError);
    return;
  }

  if (!narratives || narratives.length === 0) {
    console.log('No narratives to process');
    return;
  }

  console.log(`Found ${narratives.length} narratives to process`);

  // Process narratives in batches
  const batchSize = 10;
  let processed = 0;
  
  for (let i = 0; i < narratives.length; i += batchSize) {
    const batch = narratives.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(narratives.length / batchSize)}`);

    await Promise.all(
      batch.map(async (narrative) => {
        try {
          if (!narrative.narrative || narrative.narrative.trim() === '') {
            console.log(`Skipping empty narrative for CRD ${narrative.crd_number}`);
            return;
          }
          
          // Generate embedding
          const embedding = await generateEmbedding(narrative.narrative);
          
          // Update the narrative with the embedding
          const { error: updateError } = await supabase
            .from('narratives')
            .update({ embedding })
            .eq('crd_number', narrative.crd_number);

          if (updateError) {
            console.error(`Error updating narrative for CRD ${narrative.crd_number}:`, updateError);
          } else {
            processed++;
            console.log(`✓ Embedded narrative for CRD ${narrative.crd_number} (${processed}/${narratives.length})`);
          }
        } catch (error) {
          console.error(`Error processing narrative for CRD ${narrative.crd_number}:`, error);
        }
      })
    );

    // Add a small delay between batches to avoid overwhelming the system
    if (i + batchSize < narratives.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`Embedding process complete! Processed ${processed} narratives.`);
}

// Run the script
processAllNarratives()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

export { generateEmbedding };