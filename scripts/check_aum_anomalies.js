// Script to check AUM anomalies
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAumAnomalies() {
  try {
    console.log('Checking AUM anomalies...');
    
    // Get AUM distribution
    console.log('\nAUM value distribution:');
    
    // Check for null AUMs
    const { count: nullCount, error: nullError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
      .is('aum', null);
      
    if (nullError) {
      console.error('Error checking null AUMs:', nullError);
    } else {
      console.log(`- Null AUM values: ${nullCount}`);
    }
    
    // Check for zero AUMs
    const { count: zeroCount, error: zeroError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('aum', 0);
      
    if (zeroError) {
      console.error('Error checking zero AUMs:', zeroError);
    } else {
      console.log(`- Zero AUM values: ${zeroCount}`);
    }
    
    // Get sample rows with zero AUM
    const { data: zeroSamples, error: sampleError } = await supabase
      .from('ria_profiles')
      .select('*')
      .eq('aum', 0)
      .limit(5);
      
    if (sampleError) {
      console.error('Error fetching zero AUM samples:', sampleError);
    } else {
      console.log('\nSample rows with zero AUM:');
      zeroSamples.forEach(row => {
        console.log(JSON.stringify(row, null, 2));
      });
    }
    
    // Get AUM value ranges
    const ranges = [
      { min: 1, max: 1000000 },             // $1 to $1M
      { min: 1000001, max: 10000000 },      // $1M to $10M
      { min: 10000001, max: 100000000 },    // $10M to $100M
      { min: 100000001, max: 1000000000 },  // $100M to $1B
      { min: 1000000001, max: null }        // $1B+
    ];
    
    console.log('\nAUM value ranges:');
    
    for (const range of ranges) {
      let query = supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('aum', range.min);
        
      if (range.max) {
        query = query.lte('aum', range.max);
      }
      
      const { count, error } = await query;
      
      if (error) {
        console.error(`Error checking AUM range ${range.min}-${range.max || 'max'}:`, error);
      } else {
        console.log(`- ${range.min.toLocaleString()} to ${range.max ? range.max.toLocaleString() : 'unlimited'}: ${count} records`);
      }
    }
    
    // Get the top AUM values
    const { data: topAum, error: topError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .gt('aum', 0)
      .order('aum', { ascending: false })
      .limit(5);
      
    if (topError) {
      console.error('Error fetching top AUM values:', topError);
    } else {
      console.log('\nTop AUM values:');
      topAum.forEach((row, i) => {
        console.log(`${i + 1}. ${row.legal_name || 'Unknown'} (${row.city || ''}, ${row.state || ''}): $${row.aum.toLocaleString()}`);
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkAumAnomalies();
