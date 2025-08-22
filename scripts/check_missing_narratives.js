// Script to check for missing narratives
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkMissingNarratives() {
  try {
    console.log('Checking for RIAs without narratives...');
    
    // Get all CRD numbers from narratives
    const { data: narrativeCRDs, error: narrativeError } = await supabase
      .from('narratives')
      .select('crd_number');
      
    if (narrativeError) {
      console.error('Error fetching narrative CRDs:', narrativeError);
      return;
    }
    
    // Get sample RIA profiles
    const { data: profiles, error: profileError } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .limit(5000);
      
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }
    
    console.log(`Total narratives: ${narrativeCRDs.length}`);
    console.log(`Sample profiles checked: ${profiles.length}`);
    
    // Create a set of CRD numbers from narratives for faster lookup
    const narrativeCRDSet = new Set(narrativeCRDs.map(n => n.crd_number));
    
    // Find profiles without narratives
    const missingNarratives = profiles.filter(p => !narrativeCRDSet.has(p.crd_number));
    
    console.log(`Found ${missingNarratives.length} profiles without narratives in sample (${((missingNarratives.length/profiles.length)*100).toFixed(2)}% of sample)`);
    
    if (missingNarratives.length > 0) {
      console.log('Sample CRD numbers without narratives:');
      missingNarratives.slice(0, 10).forEach(row => console.log(`  - ${row.crd_number}`));
    }
    
    // Calculate total missing narratives
    const totalProfiles = 103620; // From previous count
    const totalNarratives = narrativeCRDs.length;
    const estimatedMissingTotal = totalProfiles - totalNarratives;
    
    console.log(`\nEstimated total profiles without narratives: ${estimatedMissingTotal} (${((estimatedMissingTotal/totalProfiles)*100).toFixed(2)}% of total)`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkMissingNarratives();
