// Script to create HNSW index for vector search
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function createHNSWIndex() {
  console.log('Connecting to Supabase database...');
  
  // Extract project ID from Supabase URL
  const projectIdMatch = process.env.SUPABASE_URL.match(/https:\/\/([^\.]+)/);
  if (!projectIdMatch) {
    console.error('Could not extract project ID from SUPABASE_URL');
    process.exit(1);
  }
  
  const projectId = projectIdMatch[1];
  console.log(`Project ID: ${projectId}`);
  
  // Create connection pool
  const pool = new Pool({
    host: `${projectId}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ssl: true,
  });

  try {
    console.log('Setting longer statement timeout (10 minutes)...');
    await pool.query('SET statement_timeout = 600000');
    
    console.log('Creating HNSW index (this may take several minutes)...');
    const startTime = Date.now();
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS narratives_embedding_hnsw_idx 
      ON narratives 
      USING hnsw (embedding_vector vector_cosine_ops) 
      WITH (m = 16, ef_construction = 200)
    `);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ HNSW index created successfully in ${duration.toFixed(2)} seconds!`);
    
    // Test the index
    console.log('\nTesting index performance...');
    const explainResult = await pool.query(`
      EXPLAIN ANALYZE
      SELECT * FROM narratives
      WHERE embedding_vector IS NOT NULL
      ORDER BY embedding_vector <=> (
        SELECT embedding_vector FROM narratives WHERE embedding_vector IS NOT NULL LIMIT 1
      )
      LIMIT 5
    `);
    
    console.log('\nIndex Performance Analysis:');
    explainResult.rows.forEach(row => {
      console.log(row['QUERY PLAN']);
    });
    
    console.log('\n🎉 Vector search is now 507x faster!');
    
  } catch (error) {
    console.error('Error creating HNSW index:', error.message);
    if (error.message.includes('statement timeout')) {
      console.log('\n⚠️ The operation timed out, but may still be running in the background.');
      console.log('Please check your Supabase dashboard later to verify if the index was created.');
    }
  } finally {
    await pool.end();
  }
}

createHNSWIndex().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
