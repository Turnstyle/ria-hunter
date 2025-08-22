// Script to analyze AUM distribution
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function calculateStatistics(values) {
  if (!values || values.length === 0) {
    return { min: null, max: null, mean: null, median: null };
  }
  
  // Filter out null/undefined values
  const cleanValues = values.filter(v => v !== null && v !== undefined);
  
  if (cleanValues.length === 0) {
    return { min: null, max: null, mean: null, median: null };
  }
  
  // Sort for median calculation
  cleanValues.sort((a, b) => a - b);
  
  const min = cleanValues[0];
  const max = cleanValues[cleanValues.length - 1];
  const sum = cleanValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / cleanValues.length;
  
  // Calculate median
  const midIndex = Math.floor(cleanValues.length / 2);
  const median = cleanValues.length % 2 === 0
    ? (cleanValues[midIndex - 1] + cleanValues[midIndex]) / 2
    : cleanValues[midIndex];
    
  return { min, max, mean, median };
}

async function analyzeAumDistribution() {
  try {
    console.log('Analyzing AUM distribution...');
    
    // Get all AUM values from ria_profiles
    const { data: profiles, error: profileError } = await supabase
      .from('ria_profiles')
      .select('aum, crd_number, legal_name, city, state')
      .limit(10000);
      
    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }
    
    console.log(`\nTotal profiles analyzed: ${profiles.length}`);
    
    // Get private fund AUM values
    const { data: funds, error: fundError } = await supabase
      .from('ria_private_funds')
      .select('gross_asset_value, fund_name, crd_number')
      .limit(1000);
      
    if (fundError) {
      console.error('Error fetching private funds:', fundError);
    }
    
    // Extract AUM values
    const aumValues = profiles.map(p => p.aum);
    const fundAumValues = funds ? funds.map(f => f.gross_asset_value) : [];
    
    // Calculate statistics
    const aumStats = calculateStatistics(aumValues);
    const fundAumStats = calculateStatistics(fundAumValues);
    
    // Format currency values
    const formatCurrency = (value) => {
      if (value === null || value === undefined) return 'N/A';
      return `$${value.toLocaleString()}`;
    };
    
    console.log('\nRIA Profiles AUM Statistics:');
    console.log(`- Min: ${formatCurrency(aumStats.min)}`);
    console.log(`- Max: ${formatCurrency(aumStats.max)}`);
    console.log(`- Mean: ${formatCurrency(aumStats.mean)}`);
    console.log(`- Median: ${formatCurrency(aumStats.median)}`);
    
    if (funds && funds.length > 0) {
      console.log('\nPrivate Funds AUM Statistics:');
      console.log(`- Min: ${formatCurrency(fundAumStats.min)}`);
      console.log(`- Max: ${formatCurrency(fundAumStats.max)}`);
      console.log(`- Mean: ${formatCurrency(fundAumStats.mean)}`);
      console.log(`- Median: ${formatCurrency(fundAumStats.median)}`);
    }
    
    // Count NULL and zero values
    const nullAums = profiles.filter(p => p.aum === null).length;
    const zeroAums = profiles.filter(p => p.aum === 0).length;
    const negativeAums = profiles.filter(p => p.aum < 0).length;
    const trillionAums = profiles.filter(p => p.aum >= 1000000000000).length; // >= $1T
    
    console.log('\nAUM Anomalies:');
    console.log(`- NULL AUM values: ${nullAums} (${((nullAums / profiles.length) * 100).toFixed(2)}%)`);
    console.log(`- Zero AUM values: ${zeroAums} (${((zeroAums / profiles.length) * 100).toFixed(2)}%)`);
    console.log(`- Negative AUM values: ${negativeAums} (${((negativeAums / profiles.length) * 100).toFixed(2)}%)`);
    console.log(`- ≥ $1 trillion AUM values: ${trillionAums} (${((trillionAums / profiles.length) * 100).toFixed(2)}%)`);
    
    // Show examples of anomalous values
    if (trillionAums > 0) {
      const trillionProfiles = profiles.filter(p => p.aum >= 1000000000000);
      console.log('\nProfiles with ≥ $1 trillion AUM:');
      trillionProfiles.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. ${p.legal_name || 'N/A'} (${p.city || 'N/A'}, ${p.state || 'N/A'}): ${formatCurrency(p.aum)}`);
      });
    }
    
    // Distribution by AUM ranges
    const ranges = [
      { name: '$0', min: 0, max: 0 },
      { name: '$1 - $1M', min: 1, max: 1000000 },
      { name: '$1M - $10M', min: 1000001, max: 10000000 },
      { name: '$10M - $100M', min: 10000001, max: 100000000 },
      { name: '$100M - $1B', min: 100000001, max: 1000000000 },
      { name: '$1B - $1T', min: 1000000001, max: 1000000000000 },
      { name: '≥ $1T', min: 1000000000001, max: Infinity }
    ];
    
    console.log('\nAUM Distribution:');
    
    for (const range of ranges) {
      const count = profiles.filter(p => p.aum !== null && p.aum >= range.min && p.aum <= range.max).length;
      console.log(`- ${range.name}: ${count} (${((count / profiles.length) * 100).toFixed(2)}%)`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

analyzeAumDistribution();
