const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixEmbeddings() {
  console.log('🔧 FIXING EMBEDDINGS: Converting JSON strings to vectors\n')
  console.log('=' .repeat(50))
  
  // First, let's check the current column type
  console.log('\n1. CHECKING CURRENT COLUMN TYPE:')
  const { data: columnInfo, error: colError } = await supabase
    .rpc('get_column_info', {
      table_name: 'narratives',
      column_name: 'embedding'
    }).catch(() => ({ data: null, error: 'Function not available' }))
  
  if (colError) {
    console.log('   Cannot check column type directly, proceeding...')
  } else if (columnInfo) {
    console.log('   Current type:', columnInfo)
  }
  
  // Check if we need to add a vector column
  console.log('\n2. CHECKING IF VECTOR COLUMN EXISTS:')
  const { data: testVector, error: testError } = await supabase
    .from('narratives')
    .select('embedding_vector')
    .limit(1)
    .single()
  
  const vectorColumnExists = !testError || !testError.message.includes('column')
  
  if (vectorColumnExists) {
    console.log('   ✅ embedding_vector column already exists')
  } else {
    console.log('   ⚠️  embedding_vector column does not exist, creating it...')
    
    // Create the vector column via SQL
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: 'ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);'
    }).catch(async () => {
      // If exec_sql doesn't exist, we'll need to do this differently
      console.log('   Attempting alternative method...')
      return { error: 'Need to use SQL editor' }
    })
    
    if (alterError) {
      console.log('\n❌ MANUAL STEP REQUIRED:')
      console.log('   Please run this SQL in Supabase SQL Editor:')
      console.log('   ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);')
      console.log('\n   Then run this script again.')
      return
    }
  }
  
  // Now convert the embeddings
  console.log('\n3. CONVERTING EMBEDDINGS:')
  
  // Get count of narratives with string embeddings
  const { count: totalToConvert } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)
    .is('embedding_vector', null)
  
  console.log(`   Found ${totalToConvert} embeddings to convert`)
  
  if (totalToConvert === 0) {
    console.log('   ✅ All embeddings already converted!')
    
    // Check if we need to update the RPC
    console.log('\n4. UPDATING MATCH_NARRATIVES RPC:')
    console.log('   The RPC needs to use embedding_vector column instead of embedding')
    console.log('   This requires updating the function in Supabase')
    return
  }
  
  // Process in batches
  const batchSize = 100
  let processed = 0
  let errors = 0
  
  while (processed < totalToConvert) {
    // Fetch batch of narratives with string embeddings
    const { data: batch, error: fetchError } = await supabase
      .from('narratives')
      .select('id, crd_number, embedding')
      .not('embedding', 'is', null)
      .is('embedding_vector', null)
      .limit(batchSize)
    
    if (fetchError) {
      console.log('   ❌ Error fetching batch:', fetchError.message)
      break
    }
    
    if (!batch || batch.length === 0) {
      break
    }
    
    // Convert each embedding
    for (const row of batch) {
      try {
        // Parse the JSON string to get the array
        const embeddingArray = JSON.parse(row.embedding)
        
        if (Array.isArray(embeddingArray) && embeddingArray.length === 768) {
          // Update with the vector
          const { error: updateError } = await supabase
            .from('narratives')
            .update({ embedding_vector: embeddingArray })
            .eq('id', row.id)
          
          if (updateError) {
            console.log(`   ❌ Failed to update CRD ${row.crd_number}:`, updateError.message)
            errors++
          } else {
            processed++
            if (processed % 100 === 0) {
              console.log(`   ✅ Processed ${processed}/${totalToConvert} (${((processed/totalToConvert)*100).toFixed(1)}%)`)
            }
          }
        } else {
          console.log(`   ⚠️  Invalid embedding for CRD ${row.crd_number}: ${embeddingArray?.length} dimensions`)
          errors++
        }
      } catch (e) {
        console.log(`   ❌ Failed to parse embedding for CRD ${row.crd_number}:`, e.message)
        errors++
      }
    }
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('CONVERSION COMPLETE:')
  console.log(`   ✅ Successfully converted: ${processed}`)
  console.log(`   ❌ Errors: ${errors}`)
  
  if (processed > 0) {
    console.log('\n⚠️  IMPORTANT NEXT STEPS:')
    console.log('1. Update the match_narratives RPC to use embedding_vector column')
    console.log('2. Create HNSW index on embedding_vector column')
    console.log('3. Drop the old embedding text column')
  }
}

// Alternative: Direct SQL approach
async function generateSQLCommands() {
  console.log('\n📝 ALTERNATIVE: SQL COMMANDS TO RUN IN SUPABASE:')
  console.log('=' .repeat(50))
  console.log(`
-- Step 1: Add vector column if it doesn't exist
ALTER TABLE narratives 
ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

-- Step 2: Convert JSON strings to vectors
UPDATE narratives 
SET embedding_vector = embedding::json::text::vector(768)
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Step 3: Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 4: Update the match_narratives function
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE(
  crd_number text,
  similarity float,
  legal_name text,
  narrative text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.crd_number,
    1 - (n.embedding_vector <=> query_embedding) as similarity,
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Step 5: Verify it works
SELECT COUNT(*) as converted_count 
FROM narratives 
WHERE embedding_vector IS NOT NULL;

-- Step 6: Test the function
-- (You'll need to provide a real embedding here)
-- SELECT * FROM match_narratives(
--   '[0.1, 0.2, ...]'::vector(768),
--   0.3,
--   5
-- );
`)
  console.log('=' .repeat(50))
}

// Run both approaches
fixEmbeddings()
  .then(() => generateSQLCommands())
  .catch(console.error)
