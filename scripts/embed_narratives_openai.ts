// Fallback embedding script using OpenAI
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.error('Error: OPENAI_API_KEY must be set');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

console.log('Using OpenAI for embeddings as fallback');

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });

    if (response.data && response.data[0] && response.data[0].embedding) {
      return response.data[0].embedding;
    }
    
    throw new Error('No embedding returned from OpenAI');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function run() {
  console.log(`Starting embedding process for up to ${LIMIT} narratives using OpenAI...`);
  
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
      await new Promise(resolve => setTimeout(resolve, 1000));
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