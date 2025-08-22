import { supabaseAdmin } from './lib/supabaseAdmin.js';

async function checkDatabaseSchema() {
  try {
    // Check narratives table schema
    console.log('📋 Checking narratives table schema...');
    const { data: schema, error: schemaError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'narratives' ORDER BY ordinal_position;`
    });
    
    if (schemaError) {
      console.error('Error checking schema:', schemaError);
    } else {
      console.log('Narratives table columns:', schema);
    }
    
    // Check sample of narratives
    console.log('\n📊 Checking sample narratives...');
    const { data: narratives, error: narrativeError } = await supabaseAdmin
      .from('narratives')
      .select('id, crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(3);
    
    if (narrativeError) {
      console.error('Error fetching narratives:', narrativeError);
    } else if (narratives && narratives.length > 0) {
      narratives.forEach((row, idx) => {
        console.log(`\nNarrative ${idx + 1}:`);
        console.log(`- CRD: ${row.crd_number}`);
        console.log(`- Embedding type: ${typeof row.embedding}`);
        if (typeof row.embedding === 'string') {
          console.log(`- String length: ${row.embedding.length}`);
          console.log(`- First 100 chars: ${row.embedding.substring(0, 100)}...`);
        } else if (Array.isArray(row.embedding)) {
          console.log(`- Array length: ${row.embedding.length}`);
          console.log(`- First 5 values: [${row.embedding.slice(0, 5).join(', ')}]`);
        }
      });
    } else {
      console.log('No narratives with embeddings found');
    }
    
    // Check table counts
    console.log('\n📈 Checking table row counts...');
    const { count: profileCount } = await supabaseAdmin
      .from('ria_profiles')
      .select('*', { head: true, count: 'exact' });
    
    const { count: narrativeCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' });
    
    const { count: narrativeWithEmbeddings } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding', 'is', null);
    
    console.log(`- ria_profiles: ${profileCount} rows`);
    console.log(`- narratives: ${narrativeCount} rows`);
    console.log(`- narratives with embeddings: ${narrativeWithEmbeddings} rows`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabaseSchema();
