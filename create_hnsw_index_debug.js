// Debug version with more logging
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function createHNSWIndex() {
  console.log('Environment variables loaded:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Extract project ID from Supabase URL
  const projectIdMatch = process.env.SUPABASE_URL.match(/https:\/\/([^\.]+)/);
  if (!projectIdMatch) {
    console.error('Could not extract project ID from SUPABASE_URL');
    process.exit(1);
  }
  
  const projectId = projectIdMatch[1];
  console.log(`Project ID: ${projectId}`);
  
  // Create client
  const client = new Client({
    host: `${projectId}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!');
    
    console.log('Testing connection with simple query...');
    const testResult = await client.query('SELECT 1 as result');
    console.log('Test query result:', testResult.rows[0]);
    
    console.log('Setting longer statement timeout (10 minutes)...');
    await client.query('SET statement_timeout = 600000');
    
    console.log('Creating HNSW index (this may take several minutes)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS narratives_embedding_hnsw_idx 
      ON narratives 
      USING hnsw (embedding_vector vector_cosine_ops) 
      WITH (m = 16, ef_construction = 200)
    `);
    
    console.log('✅ HNSW index created successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    try {
      await client.end();
      console.log('Database connection closed');
    } catch (err) {
      console.error('Error closing connection:', err);
    }
  }
}

createHNSWIndex().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
