// Apply clean schema by dropping and recreating narratives table
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyCleanSchema() {
  console.log('🧹 Applying clean schema (dropping and recreating narratives table)');
  console.log('='.repeat(60));
  
  try {
    console.log('Step 1: Enable pgvector extension...');
    
    // Enable pgvector extension first
    const extensionSQL = `CREATE EXTENSION IF NOT EXISTS vector;`;
    console.log('📄 Executing:', extensionSQL);
    
    const { error: extensionError } = await supabase.rpc('sql', {
      query: extensionSQL
    });

    if (extensionError) {
      console.log('⚠️  Extension error (may already exist):', extensionError.message);
    } else {
      console.log('✅ pgvector extension ready');
    }

    console.log('\nStep 2: Drop existing narratives table...');
    
    const dropSQL = `DROP TABLE IF EXISTS narratives CASCADE;`;
    console.log('📄 Executing:', dropSQL);
    
    const { error: dropError } = await supabase.rpc('sql', {
      query: dropSQL
    });

    if (dropError) {
      console.log('❌ Drop error:', dropError);
      return;
    } else {
      console.log('✅ Old narratives table dropped');
    }

    console.log('\nStep 3: Create new narratives table with vector(768)...');
    
    const createTableSQL = `
      CREATE TABLE narratives (
        id uuid primary key default gen_random_uuid(),
        crd_number integer references ria_profiles(crd_number) on delete cascade,
        narrative text not null,
        embedding vector(768),
        created_at timestamp with time zone default now(),
        updated_at timestamp with time zone default now()
      );
    `;
    
    console.log('📄 Executing: CREATE TABLE narratives...');
    
    const { error: createError } = await supabase.rpc('sql', {
      query: createTableSQL
    });

    if (createError) {
      console.log('❌ Create table error:', createError);
      return;
    } else {
      console.log('✅ New narratives table created with vector(768)');
    }

    console.log('\nStep 4: Create HNSW index for vector similarity...');
    
    const indexSQL = `
      CREATE INDEX idx_narratives_embedding_hnsw 
        ON narratives USING hnsw (embedding vector_ip_ops) 
        WITH (m = 16, ef_construction = 64);
    `;
    
    console.log('📄 Creating HNSW index...');
    
    const { error: indexError } = await supabase.rpc('sql', {
      query: indexSQL
    });

    if (indexError) {
      console.log('❌ Index creation error:', indexError);
      return;
    } else {
      console.log('✅ HNSW index created');
    }

    console.log('\nStep 5: Enable Row Level Security...');
    
    const rlsSQL = `
      ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY "public_read" ON narratives
        FOR SELECT 
        USING (true);
      
      CREATE POLICY "admin_insert" ON narratives
        FOR INSERT 
        WITH CHECK (true);
    `;
    
    const { error: rlsError } = await supabase.rpc('sql', {
      query: rlsSQL
    });

    if (rlsError) {
      console.log('⚠️  RLS setup error:', rlsError.message);
    } else {
      console.log('✅ Row Level Security enabled');
    }

    console.log('\nStep 6: Create updated vector search function...');
    
    const functionSQL = `
      CREATE OR REPLACE FUNCTION match_narratives(
        query_embedding vector(768),
        match_threshold float DEFAULT 0.7,
        match_count int DEFAULT 10
      )
      RETURNS TABLE (
        crd_number integer,
        narrative text,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          n.crd_number,
          n.narrative,
          1 - (n.embedding <=> query_embedding) AS similarity
        FROM narratives n
        WHERE n.embedding IS NOT NULL
          AND 1 - (n.embedding <=> query_embedding) > match_threshold
        ORDER BY n.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `;
    
    const { error: funcError } = await supabase.rpc('sql', {
      query: functionSQL
    });

    if (funcError) {
      console.log('❌ Function creation error:', funcError);
    } else {
      console.log('✅ match_narratives function created for vector(768)');
    }

    console.log('\nStep 7: Verify schema...');
    
    // Test that we can insert a dummy record
    const testSQL = `
      INSERT INTO narratives (crd_number, narrative, embedding) 
      VALUES (999999, 'Test narrative', NULL)
      RETURNING id;
    `;
    
    const { data: testData, error: testError } = await supabase.rpc('sql', {
      query: testSQL
    });

    if (testError) {
      console.log('❌ Schema test error:', testError);
    } else {
      console.log('✅ Schema test passed');
      
      // Clean up test record
      await supabase.rpc('sql', {
        query: 'DELETE FROM narratives WHERE crd_number = 999999;'
      });
    }

    // Verify table structure
    const { data: structure, error: structError } = await supabase
      .from('narratives')
      .select('*')
      .limit(0);

    if (!structError) {
      console.log('✅ Table structure verified - ready for data');
    }

  } catch (err) {
    console.error('💥 Schema setup error:', err.message);
  }
  
  console.log('='.repeat(60));
  console.log('🏁 Clean schema applied - narratives table ready for vector(768) embeddings');
}

applyCleanSchema();
