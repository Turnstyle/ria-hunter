/**
 * Embedding Script for RIA Narratives
 * 
 * This script generates vector embeddings for adviser narrative fields
 * to enable semantic search capabilities using pgvector in Supabase.
 */

import { supabase, RIAProfile } from '../lib/supabaseClient';
import { VertexAI } from '@google-cloud/aiplatform';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Vertex AI
const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

if (!projectId) {
  console.error('GOOGLE_CLOUD_PROJECT environment variable is required');
  process.exit(1);
}

const vertexAI = new VertexAI({
  project: projectId,
  location: location,
});

// Model for generating embeddings
const model = 'textembedding-gecko@003';

/**
 * Generate embedding for a given text using Vertex AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingModel = vertexAI.preview.getGenerativeModel({
      model: model,
    });

    const request = {
      instances: [{ content: text }],
    };

    const [response] = await embeddingModel.predict(request);
    return response.predictions[0].embeddings.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Create a narrative text from RIA profile data
 */
function createNarrative(profile: RIAProfile): string {
  const parts = [
    `${profile.firm_name} is a registered investment adviser`,
    profile.crd_number ? `with CRD number ${profile.crd_number}` : '',
    `located in ${profile.city}, ${profile.state}`,
    profile.aum ? `managing assets of $${profile.aum.toLocaleString()}` : '',
    profile.employee_count ? `with ${profile.employee_count} employees` : '',
    profile.website ? `website: ${profile.website}` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Main function to process all RIA profiles
 */
async function processAllProfiles() {
  console.log('Starting narrative embedding process...');

  // First, check if we need to add the embedding column
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'ria_profiles' 
          AND column_name = 'narrative_embedding'
        ) THEN
          ALTER TABLE ria_profiles ADD COLUMN narrative_embedding vector(768);
          CREATE INDEX ON ria_profiles USING ivfflat (narrative_embedding vector_cosine_ops);
        END IF;
      END $$;
    `
  });

  if (alterError) {
    console.error('Error adding embedding column:', alterError);
    console.log('Note: You may need to enable the pgvector extension in Supabase first');
    console.log('Run this SQL in Supabase: CREATE EXTENSION IF NOT EXISTS vector;');
    return;
  }

  // Fetch all profiles
  const { data: profiles, error: fetchError } = await supabase
    .from('ria_profiles')
    .select('*')
    .is('narrative_embedding', null); // Only process profiles without embeddings

  if (fetchError) {
    console.error('Error fetching profiles:', fetchError);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log('No profiles to process');
    return;
  }

  console.log(`Found ${profiles.length} profiles to process`);

  // Process profiles in batches
  const batchSize = 10;
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(profiles.length / batchSize)}`);

    await Promise.all(
      batch.map(async (profile) => {
        try {
          // Create narrative text
          const narrative = createNarrative(profile);
          
          // Generate embedding
          const embedding = await generateEmbedding(narrative);
          
          // Update the profile with the embedding
          const { error: updateError } = await supabase
            .from('ria_profiles')
            .update({ narrative_embedding: embedding })
            .eq('id', profile.id);

          if (updateError) {
            console.error(`Error updating profile ${profile.firm_name}:`, updateError);
          } else {
            console.log(`✓ Embedded: ${profile.firm_name}`);
          }
        } catch (error) {
          console.error(`Error processing profile ${profile.firm_name}:`, error);
        }
      })
    );

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('Embedding process complete!');
}

// Run the script
if (require.main === module) {
  processAllProfiles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { generateEmbedding, createNarrative }; 