// Script to find AUM outliers
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function findAumOutliers() {
  try {
    console.log('Finding RIA profiles with highest AUM values...');
    
    // Get top 5 AUM values
    const { data: topAum, error: topError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, form_adv_date')
      .order('aum', { ascending: false })
      .limit(10);
      
    if (topError) {
      console.error('Error fetching top AUM values:', topError);
      return;
    }
    
    if (!topAum || topAum.length === 0) {
      console.log('No RIA profiles found');
      return;
    }
    
    console.log('\nTop AUM values:');
    topAum.forEach((profile, i) => {
      console.log(`${i + 1}. CRD: ${profile.crd_number}, Name: ${profile.legal_name || 'N/A'}, Location: ${profile.city || 'N/A'}, ${profile.state || 'N/A'}, AUM: $${profile.aum ? profile.aum.toLocaleString() : 'N/A'}, Form ADV Date: ${profile.form_adv_date || 'N/A'}`);
    });
    
    // Try to determine the source file for these profiles
    console.log('\nInvestigating source files...');
    
    // First, check if any CRD numbers are in the 900000+ range (synthetic)
    const syntheticCRDs = topAum.filter(p => p.crd_number >= 900000);
    if (syntheticCRDs.length > 0) {
      console.log(`${syntheticCRDs.length} of the top AUM profiles have synthetic CRD numbers (900000+)`);
      console.log('These are likely generated during data import and not tied to a specific raw file.');
    }
    
    // Look for logs that might indicate source files
    console.log('\nChecking embedding logs for related information...');
    
    // Check for unusual patterns in the data
    console.log('\nAnalyzing AUM distribution patterns:');
    
    // Get statistics for profiles with AUM > $1 trillion
    const { data: trillionProfiles, error: trillionError } = await supabase
      .from('ria_profiles')
      .select('*')
      .gt('aum', 1000000000000)
      .limit(100);
      
    if (trillionError) {
      console.error('Error fetching trillion+ AUM profiles:', trillionError);
    } else if (trillionProfiles && trillionProfiles.length > 0) {
      console.log(`Found ${trillionProfiles.length} profiles with AUM > $1 trillion`);
      
      // Check for patterns in the trillion+ profiles
      const emptyLegalNames = trillionProfiles.filter(p => !p.legal_name || p.legal_name === 'N').length;
      console.log(`- ${emptyLegalNames} have empty or 'N' legal names (${((emptyLegalNames / trillionProfiles.length) * 100).toFixed(2)}%)`);
      
      const hasWebsite = trillionProfiles.filter(p => p.website).length;
      console.log(`- ${hasWebsite} have website URLs (${((hasWebsite / trillionProfiles.length) * 100).toFixed(2)}%)`);
      
      // Check for commonalities in locations
      const locations = {};
      trillionProfiles.forEach(p => {
        const location = `${p.city || 'Unknown'}, ${p.state || 'Unknown'}`;
        locations[location] = (locations[location] || 0) + 1;
      });
      
      console.log('\nCommon locations for trillion+ AUM profiles:');
      Object.entries(locations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([location, count]) => {
          console.log(`- ${location}: ${count} profiles (${((count / trillionProfiles.length) * 100).toFixed(2)}%)`);
        });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

findAumOutliers();
