// Simple database check using direct SQL query
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDatabase() {
  try {
    // Check narratives count
    const { count, error } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error checking narratives:', error);
    } else {
      console.log(`✅ Total narratives: ${count}`);
    }

    // Check narratives with embeddings
    const { count: embeddedCount, error: embeddedError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embeddedError) {
      console.error('Error checking embedded narratives:', embeddedError);
    } else {
      console.log(`📊 Narratives with embeddings: ${embeddedCount}`);
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabase();