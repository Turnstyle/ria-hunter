import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStates() {
  // Get all unique states
  const { data, error } = await supabase
    .from('ria_profiles')
    .select('state')
    .limit(10000);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  // Count by state
  const stateCounts = new Map<string, number>();
  data.forEach(row => {
    const state = row.state;
    stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
  });
  
  // Sort by count
  const sorted = Array.from(stateCounts.entries())
    .sort((a, b) => b[1] - a[1]);
  
  console.log('RIA counts by state:');
  sorted.slice(0, 20).forEach(([state, count]) => {
    console.log(`  ${state}: ${count} RIAs`);
  });
  
  console.log(`\nTotal states: ${stateCounts.size}`);
  console.log(`Missouri (MO): ${stateCounts.get('MO') || 0} RIAs`);
  
  // Check a specific Missouri query
  const { data: moData, error: moError } = await supabase
    .from('ria_profiles')
    .select('legal_name, city, state, aum')
    .eq('state', 'MO')
    .order('aum', { ascending: false })
    .limit(5);
    
  if (moData && moData.length > 0) {
    console.log('\nTop 5 RIAs in Missouri by AUM:');
    moData.forEach((ria, i) => {
      console.log(`  ${i+1}. ${ria.legal_name} - ${ria.city}, ${ria.state} - AUM: $${ria.aum?.toLocaleString() || 'N/A'}`);
    });
  }
}

checkStates().catch(console.error);