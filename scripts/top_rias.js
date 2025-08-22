// Script to identify top RIAs by AUM and funds
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getTopRIAs() {
  try {
    console.log('Retrieving top RIAs by AUM...');
    
    // Query top RIAs by AUM
    const { data: topByAUM, error: aumError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .order('aum', { ascending: false })
      .limit(10);
      
    if (aumError) {
      console.error('Error fetching top RIAs by AUM:', aumError);
    } else {
      console.log('Top 10 RIAs by AUM:');
      topByAUM.forEach((ria, index) => {
        console.log(`${index + 1}. ${ria.legal_name} (${ria.city}, ${ria.state}) - $${(ria.aum / 1000000).toFixed(2)} million`);
      });
    }
    
    console.log('\nRetrieving top RIAs by private fund count...');
    
    // Query top RIAs by fund count
    const { data: topByFunds, error: fundsError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, private_fund_count, private_fund_aum')
      .order('private_fund_count', { ascending: false })
      .limit(10);
      
    if (fundsError) {
      console.error('Error fetching top RIAs by fund count:', fundsError);
    } else {
      console.log('Top 10 RIAs by private fund count:');
      topByFunds.forEach((ria, index) => {
        console.log(`${index + 1}. ${ria.legal_name} (${ria.city}, ${ria.state}) - ${ria.private_fund_count} funds, $${(ria.private_fund_aum / 1000000).toFixed(2)} million AUM`);
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

getTopRIAs();
