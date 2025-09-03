// Check remaining generic narratives
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Get supabase credentials
const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
    return match ? match[1].trim() : null;
  } catch (err) {
    console.error('Error reading .env.local:', err.message);
    process.exit(1);
  }
})();

if (!supabaseKey) {
  console.error('Could not find SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNarratives() {
  try {
    console.log('Checking narrative stats...');
    
    // Total narratives
    const { count: totalCount, error: totalError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
      
    if (totalError) {
      console.error('Error getting total count:', totalError.message);
      return;
    }
    
    // Generic narratives
    const { count: genericCount, error: genericError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .ilike('narrative', 'Investment Adviser (CRD #%');
      
    if (genericError) {
      console.error('Error getting generic count:', genericError.message);
      return;
    }
    
    console.log(`Total narratives: ${totalCount}`);
    console.log(`Generic narratives: ${genericCount}`);
    console.log(`Non-generic narratives: ${totalCount - genericCount}`);
    console.log(`Completion rate: ${((totalCount - genericCount) / totalCount * 100).toFixed(2)}%`);
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkNarratives();
