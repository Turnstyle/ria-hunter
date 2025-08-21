import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabaseStatus() {
  console.log('Checking database status...');
  console.log('Supabase URL:', supabaseUrl);

  try {
    // Check ria_profiles table
    const { data: riaProfilesCount, error: riaProfilesError } = await supabase
      .from('ria_profiles')
      .select('count');

    if (riaProfilesError) {
      console.error('Error querying ria_profiles:', riaProfilesError.message);
    } else {
      console.log('RIA Profiles count:', riaProfilesCount?.[0]?.count || 0);
    }

    // Check narratives table
    const { data: narrativesCount, error: narrativesError } = await supabase
      .from('narratives')
      .select('count');

    if (narrativesError) {
      console.error('Error querying narratives:', narrativesError.message);
    } else {
      console.log('Narratives count:', narrativesCount?.[0]?.count || 0);
    }

    // Check how many narratives have embeddings
    const { data: embeddingsCount, error: embeddingsError } = await supabase
      .from('narratives')
      .select('count')
      .not('embedding', 'is', null);

    if (embeddingsError) {
      console.error('Error querying embeddings:', embeddingsError.message);
    } else {
      console.log('Narratives with embeddings count:', embeddingsCount?.[0]?.count || 0);
    }

    // Check control_persons table
    const { data: controlPersonsCount, error: controlPersonsError } = await supabase
      .from('control_persons')
      .select('count');

    if (controlPersonsError) {
      console.error('Error querying control_persons:', controlPersonsError.message);
    } else {
      console.log('Control persons count:', controlPersonsCount?.[0]?.count || 0);
    }

    // Check private_funds table
    const { data: privateFundsCount, error: privateFundsError } = await supabase
      .from('private_funds')
      .select('count');

    if (privateFundsError) {
      console.error('Error querying private_funds:', privateFundsError.message);
    } else {
      console.log('Private funds count:', privateFundsCount?.[0]?.count || 0);
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabaseStatus().catch(console.error);
