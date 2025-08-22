// Script to check for duplicate CRD numbers
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDuplicateCRDs() {
  try {
    console.log('Checking for duplicate CRD numbers...');
    
    // Get all CRD numbers from ria_profiles - increase limit to 10000
    const { data: profiles, error: profileError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .order('crd_number', { ascending: true })
      .limit(10000);
      
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }
    
    console.log(`\nTotal profiles: ${profiles.length}`);
    
    // Create a map of CRD numbers to profiles
    const crdMap = new Map();
    const duplicates = [];
    
    profiles.forEach(profile => {
      const crd = profile.crd_number;
      
      if (crdMap.has(crd)) {
        // This is a duplicate
        const existingProfiles = crdMap.get(crd);
        existingProfiles.push(profile);
        crdMap.set(crd, existingProfiles);
        
        // Add to duplicates list if this is the second occurrence
        if (existingProfiles.length === 2) {
          duplicates.push(crd);
        }
      } else {
        // First occurrence of this CRD
        crdMap.set(crd, [profile]);
      }
    });
    
    const distinctCRDs = crdMap.size;
    const duplicateCRDs = duplicates.length;
    
    console.log(`Distinct CRD numbers: ${distinctCRDs}`);
    console.log(`Duplicate CRD numbers: ${duplicateCRDs}`);
    
    if (duplicateCRDs > 0) {
      console.log('\nSample duplicate CRD numbers:');
      
      // Show up to 10 examples of duplicates
      const sampleDuplicates = duplicates.slice(0, 10);
      
      for (const crd of sampleDuplicates) {
        const profiles = crdMap.get(crd);
        
        console.log(`\nCRD ${crd} appears ${profiles.length} times:`);
        profiles.forEach((profile, index) => {
          console.log(`  ${index + 1}. ${profile.legal_name || 'N/A'} (${profile.city || 'N/A'}, ${profile.state || 'N/A'})`);
        });
      }
      
      // Also count how many duplicates are for synthetic CRDs (900000+)
      const syntheticDuplicates = duplicates.filter(crd => crd >= 900000);
      console.log(`\nDuplicate synthetic CRDs (900000+): ${syntheticDuplicates.length}`);
    }
    
    // Check for CRD types
    console.log('\nCRD number type distribution:');
    
    const regularCRDs = profiles.filter(p => p.crd_number < 900000).length;
    const syntheticCRDs = profiles.filter(p => p.crd_number >= 900000).length;
    
    console.log(`- Regular CRDs (< 900000): ${regularCRDs} (${((regularCRDs / profiles.length) * 100).toFixed(2)}%)`);
    console.log(`- Synthetic CRDs (≥ 900000): ${syntheticCRDs} (${((syntheticCRDs / profiles.length) * 100).toFixed(2)}%)`);
    
    // Verify crd_number is the primary key
    console.log('\nChecking if crd_number is the primary key...');
    
    // We can't directly query the schema, but we can try to insert a duplicate CRD
    // and see if it fails with a unique constraint violation
    
    if (duplicateCRDs === 0 && duplicates.length === 0) {
      // Only try this if we didn't find duplicates, as existence of duplicates implies no PK
      try {
        // Get a random existing CRD
        const { data: sampleProfile } = await supabase
          .from('ria_profiles')
          .select('crd_number')
          .limit(1)
          .single();
          
        if (sampleProfile) {
          const crd = sampleProfile.crd_number;
          
          // Try to insert a duplicate
          const { data: insertData, error: insertError } = await supabase
            .from('ria_profiles')
            .insert([
              { crd_number: crd, legal_name: 'Duplicate Test' }
            ]);
            
          if (insertError) {
            const isPkViolation = insertError.message.includes('violates unique constraint') ||
                                insertError.message.includes('duplicate key value');
                                
            if (isPkViolation) {
              console.log('crd_number appears to be the primary key (unique constraint violation)');
            } else {
              console.log('Error occurred but not a PK violation:', insertError.message);
            }
          } else {
            console.log('crd_number is NOT the primary key (duplicate insertion succeeded)');
            
            // Clean up the test insertion
            const { error: deleteError } = await supabase
              .from('ria_profiles')
              .delete()
              .eq('crd_number', crd)
              .eq('legal_name', 'Duplicate Test');
              
            if (deleteError) {
              console.error('Error cleaning up test insertion:', deleteError);
            }
          }
        }
      } catch (e) {
        console.error('Error testing primary key:', e);
      }
    } else {
      console.log('crd_number is NOT the primary key (duplicates exist)');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDuplicateCRDs();
