// Vertex AI Embeddings with truncation to 384 dimensions 
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;

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

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const accessToken = await auth.getAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    // Use text-embedding-005 (the current recommended model)
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`;
    console.log(`🧪 Using text-embedding-005...`);
    
    const requestBody = {
      instances: [{ content: text }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.predictions && result.predictions[0] && result.predictions[0].embeddings) {
      const fullEmbedding = result.predictions[0].embeddings.values;
      
      // Truncate to 384 dimensions to match database schema
      const truncatedEmbedding = fullEmbedding.slice(0, 384);
      
      console.log(`✅ Generated embedding: ${fullEmbedding.length} → ${truncatedEmbedding.length} dimensions`);
      return truncatedEmbedding;
    }
    
    throw new Error('No embedding values returned from Vertex AI API');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

async function run() {
  console.log(`🚀 Processing ${LIMIT} narrative(s) with Vertex AI text-embedding-005...`);
  console.log('✂️  Truncating 768D embeddings to 384D to match database schema');
  
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

  let successCount = 0;
  let errorCount = 0;

  for (const row of data) {
    if (!row.narrative || row.narrative.trim() === '') {
      console.log(`⏭️  Skipping empty narrative for CRD ${row.crd_number}`);
      continue;
    }

    try {
      console.log(`\n🔄 Processing CRD ${row.crd_number}...`);
      console.log(`📄 Narrative preview: ${row.narrative.substring(0, 100)}...`);
      
      // Generate embedding
      const embedding = await generateEmbedding(row.narrative);
      
      // Update database  
      const { error: updateError } = await supabase
        .from('narratives')
        .update({ embedding: embedding })
        .eq('crd_number', row.crd_number);

      if (updateError) {
        console.error(`❌ Database update error for CRD ${row.crd_number}:`, updateError);
        console.error(`   Embedding length: ${embedding.length}`);
        errorCount++;
      } else {
        console.log(`✅ Successfully embedded CRD ${row.crd_number} (${successCount + 1}/${data.length})`);
        successCount++;
      }
      
    } catch (error) {
      console.error(`❌ Error processing CRD ${row.crd_number}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n🎉 Embedding process complete!`);
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  
  if (successCount > 0) {
    console.log(`\n🚀 🎉 SUCCESS! Real Vertex AI embeddings are working! 🎉`);
    console.log(`📊 Database now has real 384D embeddings from text-embedding-005`);
    console.log(`🔥 Ready to process all remaining narratives!`);
    console.log(`\n📋 Next steps:`); 
    console.log(`   1. Run with --limit=100 to test larger batch`);
    console.log(`   2. Run without limit to process all ~81,000 narratives`);
  }
}

// Run the script
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});