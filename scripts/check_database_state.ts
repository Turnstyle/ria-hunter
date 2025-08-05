// Check database state for embeddings setup
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDatabaseState() {
  console.log('Checking database state...\n');

  try {
    // Check if narratives table exists and get count
    const { data: narratives, error: narrativesError } = await supabase
      .from('narratives')
      .select('crd_number', { count: 'exact', head: true });

    if (narrativesError) {
      console.error('❌ Error checking narratives table:', narrativesError);
      return;
    }

    console.log(`✅ Narratives table exists with ${narratives?.length || 0} rows`);

    // Check embedding column by trying to select it
    const { data: embeddingCheck, error: embeddingError } = await supabase
      .from('narratives')
      .select('embedding')
      .limit(1);

    if (embeddingError) {
      console.log('❌ Embedding column does not exist or has issues:', embeddingError);
    } else {
      console.log('✅ Embedding column exists');
    }

    // Count how many narratives have embeddings
    const { data: embeddedCount, error: countError } = await supabase
      .from('narratives')
      .select('crd_number', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (!countError) {
      console.log(`📊 Narratives with embeddings: ${embeddedCount?.length || 0}`);
    }

    // Test vector extension by running a simple query
    const { data: vectorTest, error: vectorError } = await supabase.rpc('exec', {
      sql: "SELECT 'vector extension test' as test"
    });

    if (vectorError) {
      console.log('❌ Database function execution failed:', vectorError);
    } else {
      console.log('✅ Database connection and execution working');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkDatabaseState();