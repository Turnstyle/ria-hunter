// Check the schema of the narratives table
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNarrativesSchema() {
  try {
    console.log('Checking narratives table schema...');
    
    // Get one record to inspect schema
    const { data, error } = await supabase
      .from('narratives')
      .select('*')
      .limit(1);
      
    if (error) {
      console.error('Error fetching narratives:', error.message);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('No narratives found');
      return;
    }
    
    console.log('Narratives table schema:');
    const columns = Object.keys(data[0]);
    columns.forEach(column => {
      console.log(`- ${column}: ${typeof data[0][column]}`);
    });
    
    console.log('\nSample record:');
    console.log(JSON.stringify(data[0], null, 2));
  } catch (error) {
    console.error('Error checking schema:', error.message);
  }
}

checkNarrativesSchema();
