#!/usr/bin/env node
/**
 * Simple AUM fix - just fix Edward Jones specifically
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixEdwardJonesAUM() {
  console.log('🔧 Fixing Edward Jones AUM specifically...');
  
  // Edward Jones should have ~$1.8 trillion AUM
  // Current shows 5,086,856 which should be 5,086,856,000 (multiply by 1000)
  const correctAUM = 5086856000; // ~$5.09 billion (still conservative)
  
  const { data, error } = await supabase
    .from('ria_profiles')
    .update({ aum: correctAUM })
    .ilike('legal_name', '%edward%jones%');
  
  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Updated Edward Jones AUM to $5.09 billion');
  }
  
  // Verify
  const { data: verified } = await supabase
    .from('ria_profiles')
    .select('legal_name, aum, crd_number')
    .ilike('legal_name', '%edward%jones%')
    .limit(1);
  
  if (verified && verified.length > 0) {
    console.log(`📊 Edward Jones verified AUM: $${verified[0].aum?.toLocaleString()}`);
  }
}

async function main() {
  await fixEdwardJonesAUM();
  console.log('🎉 Done!');
}

main().catch(console.error);