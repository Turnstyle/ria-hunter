// Fix the database schema to accept 768-dimensional embeddings
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixEmbeddingSchema() {
  console.log('🔧 Fixing embedding column schema to accept 768 dimensions...');
  
  try {
    // First, let's check the current schema
    const { data: schemaData, error: schemaError } = await supabase.rpc('exec', {
      sql: `
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'narratives' AND column_name = 'embedding';
      `
    });
    
    if (schemaError) {
      console.log('⚠️  Could not query schema (this is ok), proceeding with schema fix...');
    } else {
      console.log('📊 Current schema:', schemaData);
    }

    // Clear all fake embeddings first (they're 384-dimensional)
    console.log('🧹 Clearing fake 384-dimensional embeddings...');
    const { error: clearError } = await supabase
      .from('narratives')
      .update({ embedding: null })
      .not('embedding', 'is', null);

    if (clearError) {
      console.log('⚠️  Error clearing embeddings (this might be ok):', clearError.message);
    } else {
      console.log('✅ Cleared existing fake embeddings');
    }

    // Now update the schema to explicitly support 768 dimensions
    console.log('🔧 Updating embedding column to vector(768)...');
    const { error: alterError } = await supabase.rpc('exec', {
      sql: `
        -- Drop and recreate the embedding column with proper dimensions
        ALTER TABLE narratives DROP COLUMN IF EXISTS embedding;
        ALTER TABLE narratives ADD COLUMN embedding vector(768);
        
        -- Recreate the index for similarity search
        DROP INDEX IF EXISTS narratives_embedding_idx;
        CREATE INDEX narratives_embedding_idx ON narratives 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        
        -- Update the match function to work with 768-dimensional vectors
        CREATE OR REPLACE FUNCTION match_narratives(
          query_embedding vector(768),
          match_threshold float DEFAULT 0.5,
          match_count int DEFAULT 10
        )
        RETURNS TABLE (
          crd_number int,
          narrative text,
          similarity float
        )
        LANGUAGE SQL STABLE
        AS $$
          SELECT
            narratives.crd_number,
            narratives.narrative,
            1 - (narratives.embedding <=> query_embedding) AS similarity
          FROM narratives
          WHERE narratives.embedding <=> query_embedding < 1 - match_threshold
          ORDER BY narratives.embedding <=> query_embedding
          LIMIT match_count;
        $$;
      `
    });

    if (alterError) {
      console.error('❌ Error updating schema:', alterError);
      return;
    }

    console.log('✅ Successfully updated database schema!');
    console.log('📏 Embedding column now supports 768 dimensions');
    console.log('🚀 Ready for real Vertex AI embeddings!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixEmbeddingSchema().catch(console.error);