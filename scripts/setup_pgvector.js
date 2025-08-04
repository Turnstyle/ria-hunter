// scripts/setup_pgvector.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupPgVector() {
  console.log('Setting up pgvector extension and index...');

  // First, enable pgvector extension
  const { data: extData, error: extError } = await supabase.rpc('exec', {
    sql: 'CREATE EXTENSION IF NOT EXISTS vector;'
  });

  if (extError) {
    console.log('Note: Could not create extension via RPC. This might need to be done manually in Supabase dashboard.');
    console.log('Error:', extError.message);
  } else {
    console.log('✓ pgvector extension enabled');
  }

  // Check if embedding column exists
  const { data: colData, error: colError } = await supabase
    .from('narratives')
    .select('embedding')
    .limit(1);

  if (colError && colError.message.includes('column "embedding" does not exist')) {
    console.log('Adding embedding column...');
    const { error: alterError } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE public.narratives ADD COLUMN embedding vector(768);'
    });
    
    if (alterError) {
      console.log('Error adding embedding column:', alterError.message);
    } else {
      console.log('✓ Added embedding column');
    }
  } else {
    console.log('✓ Embedding column already exists');
  }

  // Create index
  const { error: indexError } = await supabase.rpc('exec', {
    sql: 'CREATE INDEX IF NOT EXISTS idx_narr_vec ON public.narratives USING ivfflat (embedding vector_cosine_ops);'
  });

  if (indexError) {
    console.log('Error creating index:', indexError.message);
    console.log('\nPlease run these SQL commands manually in Supabase SQL editor:');
    console.log('1. CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('2. ALTER TABLE public.narratives ADD COLUMN embedding vector(768);');
    console.log('3. CREATE INDEX IF NOT EXISTS idx_narr_vec ON public.narratives USING ivfflat (embedding vector_cosine_ops);');
  } else {
    console.log('✓ Created pgvector index');
  }

  console.log('\nSetup complete!');
}

setupPgVector().catch(console.error);