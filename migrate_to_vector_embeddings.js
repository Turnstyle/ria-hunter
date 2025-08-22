// Migrate string embeddings to proper vector(768) format
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (function() {
  const fs = require('fs');
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateToVectorEmbeddings() {
  console.log('🔄 Migrating embeddings from string to vector(768) format');
  console.log('='.repeat(60));
  
  try {
    console.log('Step 1: Enable pgvector extension...');
    
    // Enable pgvector extension
    const { error: extensionError } = await supabase.rpc('sql', {
      query: 'CREATE EXTENSION IF NOT EXISTS vector;'
    });

    if (extensionError) {
      console.log('❌ pgvector extension error:', extensionError);
      // This might not work via RPC, let's continue and see if it's already enabled
      console.log('   🔄 Continuing (extension might already be enabled)...');
    } else {
      console.log('✅ pgvector extension enabled');
    }

    console.log('\nStep 2: Add vector column to narratives table...');
    
    // Add new vector column
    const { error: alterError } = await supabase.rpc('sql', {
      query: `
        ALTER TABLE narratives 
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768);
      `
    });

    if (alterError) {
      console.log('❌ Error adding vector column:', alterError);
      return;
    } else {
      console.log('✅ Added embedding_vector column');
    }

    console.log('\nStep 3: Convert string embeddings to vectors...');
    
    // Get all records with string embeddings
    const { data: records, error: fetchError } = await supabase
      .from('narratives')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .is('embedding_vector', null);

    if (fetchError) {
      console.log('❌ Error fetching records:', fetchError);
      return;
    }

    console.log(`📊 Found ${records.length} records to convert`);

    // Process in batches
    const batchSize = 50;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)} (${batch.length} records)...`);

      for (const record of batch) {
        try {
          // Parse the JSON string embedding
          const embeddingArray = JSON.parse(record.embedding);
          
          if (!Array.isArray(embeddingArray) || embeddingArray.length !== 768) {
            console.log(`⚠️  Skipping record ${record.id}: invalid embedding format (length: ${embeddingArray?.length})`);
            errors++;
            continue;
          }

          // Update with vector format - we need to format it properly for PostgreSQL
          const vectorString = '[' + embeddingArray.join(',') + ']';
          
          const { error: updateError } = await supabase.rpc('sql', {
            query: `
              UPDATE narratives 
              SET embedding_vector = $1::vector 
              WHERE id = $2;
            `,
            params: [vectorString, record.id]
          });

          if (updateError) {
            console.log(`❌ Update error for ${record.id}:`, updateError);
            errors++;
          } else {
            processed++;
          }

        } catch (parseError) {
          console.log(`❌ Parse error for ${record.id}:`, parseError.message);
          errors++;
        }
      }

      // Show progress
      const progressPercent = Math.round((processed / records.length) * 100);
      console.log(`   ✅ Progress: ${processed}/${records.length} (${progressPercent}%) - Errors: ${errors}`);
    }

    console.log(`\n📊 Migration completed:`);
    console.log(`   ✅ Successfully processed: ${processed}`);
    console.log(`   ❌ Errors: ${errors}`);

    if (processed > 0) {
      console.log('\nStep 4: Create HNSW index on vector column...');
      
      const { error: indexError } = await supabase.rpc('sql', {
        query: `
          CREATE INDEX IF NOT EXISTS idx_narratives_embedding_vector_hnsw 
          ON narratives USING hnsw (embedding_vector vector_ip_ops) 
          WITH (m = 16, ef_construction = 64);
        `
      });

      if (indexError) {
        console.log('❌ Index creation error:', indexError);
      } else {
        console.log('✅ HNSW index created');
      }

      console.log('\nStep 5: Verify migration...');
      
      // Verify the migration worked
      const { count: vectorCount } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
        .not('embedding_vector', 'is', null);

      console.log(`✅ ${vectorCount} records now have vector embeddings`);

      // Test vector similarity
      if (vectorCount > 0) {
        console.log('\nStep 6: Test vector similarity...');
        
        const { data: testData, error: testError } = await supabase.rpc('sql', {
          query: `
            SELECT id, narrative, embedding_vector <=> embedding_vector as self_similarity
            FROM narratives 
            WHERE embedding_vector IS NOT NULL 
            LIMIT 1;
          `
        });

        if (testError) {
          console.log('❌ Similarity test error:', testError);
        } else {
          console.log('✅ Vector similarity test successful');
          console.log('   Self-similarity should be 0:', testData);
        }
      }
    }

  } catch (err) {
    console.error('💥 Migration error:', err.message);
  }
  
  console.log('='.repeat(60));
  console.log('🏁 Vector migration complete');
}

migrateToVectorEmbeddings();
