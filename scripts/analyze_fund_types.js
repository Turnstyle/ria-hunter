const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeFundTypes() {
  console.log('🔍 Analyzing current fund type classifications...\n');
  
  // Get a sample of funds and their types
  const { data: funds, error } = await supabase
    .from('ria_private_funds')
    .select('fund_name, fund_type, fund_type_other, gross_asset_value, is_fund_of_funds')
    .limit(1000);
  
  if (error) {
    console.error('Error fetching funds:', error);
    return;
  }
  
  console.log(`Found ${funds.length} funds to analyze\n`);
  
  // Count fund types
  const fundTypeCounts = {};
  const fundTypeExamples = {};
  let genericCount = 0;
  let unclassifiedCount = 0;
  
  funds.forEach(fund => {
    const type = fund.fund_type || 'Unclassified';
    
    // Track generic classifications
    if (type === 'Special Situations Fund' || 
        type === 'Fund of Funds' || 
        type === 'Investment Fund' ||
        type === 'Other' ||
        type === 'Unclassified') {
      genericCount++;
    }
    
    if (!fund.fund_type) {
      unclassifiedCount++;
    }
    
    // Count occurrences
    fundTypeCounts[type] = (fundTypeCounts[type] || 0) + 1;
    
    // Store examples
    if (!fundTypeExamples[type]) {
      fundTypeExamples[type] = [];
    }
    if (fundTypeExamples[type].length < 3) {
      fundTypeExamples[type].push(fund.fund_name);
    }
  });
  
  // Sort by count
  const sortedTypes = Object.entries(fundTypeCounts)
    .sort((a, b) => b[1] - a[1]);
  
  console.log('📊 Fund Type Distribution:');
  console.log('========================');
  sortedTypes.forEach(([type, count]) => {
    const percentage = ((count / funds.length) * 100).toFixed(1);
    console.log(`${type}: ${count} (${percentage}%)`);
    if (fundTypeExamples[type]) {
      console.log(`  Examples:`);
      fundTypeExamples[type].forEach(name => {
        console.log(`    - ${name}`);
      });
    }
    console.log();
  });
  
  console.log('\n📈 Summary:');
  console.log('===========');
  console.log(`Total funds analyzed: ${funds.length}`);
  console.log(`Generic/poor classifications: ${genericCount} (${((genericCount/funds.length)*100).toFixed(1)}%)`);
  console.log(`Unclassified funds: ${unclassifiedCount} (${((unclassifiedCount/funds.length)*100).toFixed(1)}%)`);
  console.log(`\n❌ Problem: ${((genericCount/funds.length)*100).toFixed(1)}% of funds have generic classifications that don't identify actual VC/PE activity`);
  
  // Analyze fund names to suggest better classifications
  console.log('\n🔬 Analyzing fund names for better classification patterns...\n');
  
  const namePatternsVC = [
    /venture/i,
    /\bvc\b/i,
    /seed/i,
    /early stage/i,
    /startup/i,
    /series [a-c]/i,
    /innovation/i,
    /technology fund/i
  ];
  
  const namePatternsPC = [
    /private equity/i,
    /\bpe\b/i,
    /buyout/i,
    /growth equity/i,
    /lbo/i,
    /acquisition/i,
    /leveraged/i,
    /mezzanine/i
  ];
  
  const namePatternsHF = [
    /hedge/i,
    /absolute return/i,
    /market neutral/i,
    /arbitrage/i,
    /long[\s\-\/]short/i,
    /quant/i,
    /macro/i
  ];
  
  const namePatternsRE = [
    /real estate/i,
    /property/i,
    /reit/i,
    /real property/i,
    /development fund/i,
    /opportunity zone/i
  ];
  
  const namePatternsCredit = [
    /credit/i,
    /debt/i,
    /loan/i,
    /direct lending/i,
    /distressed/i,
    /fixed income/i
  ];
  
  let couldBeVC = 0;
  let couldBePE = 0;
  let couldBeHF = 0;
  let couldBeRE = 0;
  let couldBeCredit = 0;
  
  funds.forEach(fund => {
    const name = fund.fund_name || '';
    
    if (namePatternsVC.some(pattern => pattern.test(name))) couldBeVC++;
    if (namePatternsPC.some(pattern => pattern.test(name))) couldBePE++;
    if (namePatternsHF.some(pattern => pattern.test(name))) couldBeHF++;
    if (namePatternsRE.some(pattern => pattern.test(name))) couldBeRE++;
    if (namePatternsCredit.some(pattern => pattern.test(name))) couldBeCredit++;
  });
  
  console.log('🎯 Potential Reclassifications Based on Fund Names:');
  console.log('==================================================');
  console.log(`Could be Venture Capital: ${couldBeVC} funds`);
  console.log(`Could be Private Equity: ${couldBePE} funds`);
  console.log(`Could be Hedge Fund: ${couldBeHF} funds`);
  console.log(`Could be Real Estate: ${couldBeRE} funds`);
  console.log(`Could be Credit/Debt: ${couldBeCredit} funds`);
  
  console.log('\n✅ Recommendation: Implement intelligent fund classification using:');
  console.log('  1. Fund name pattern matching');
  console.log('  2. Investment strategy analysis from narratives');
  console.log('  3. SEC filing data parsing');
  console.log('  4. Machine learning classification based on fund characteristics');
}

analyzeFundTypes().catch(console.error);
