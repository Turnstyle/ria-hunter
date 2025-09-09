const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Enhanced fund type classification rules
const FUND_CLASSIFICATIONS = {
  'Venture Capital': {
    patterns: [
      /venture/i,
      /\bvc\b/i,
      /seed/i,
      /early[\s\-]?stage/i,
      /startup/i,
      /series\s+[a-c]/i,
      /innovation/i,
      /technology\s+fund/i,
      /growth\s+capital/i,
      /angel/i,
      /incubat/i,
      /accelerat/i
    ],
    keywords: ['venture', 'vc', 'seed', 'startup', 'early stage', 'series a', 'series b', 'innovation', 'technology investment'],
    priority: 1
  },
  'Private Equity': {
    patterns: [
      /private\s+equity/i,
      /\bpe\b/i,
      /buyout/i,
      /growth\s+equity/i,
      /\blbo\b/i,
      /acquisition/i,
      /leveraged/i,
      /mezzanine/i,
      /control\s+investment/i,
      /middle\s+market/i,
      /portfolio\s+company/i
    ],
    keywords: ['private equity', 'pe', 'buyout', 'lbo', 'acquisition', 'leveraged buyout', 'growth equity'],
    priority: 2
  },
  'Hedge Fund': {
    patterns: [
      /hedge/i,
      /absolute\s+return/i,
      /market\s+neutral/i,
      /arbitrage/i,
      /long[\s\-\/]short/i,
      /quant/i,
      /macro/i,
      /multi[\s\-]strategy/i,
      /event[\s\-]driven/i,
      /statistical\s+arbitrage/i,
      /relative\s+value/i
    ],
    keywords: ['hedge', 'absolute return', 'arbitrage', 'long short', 'quantitative', 'macro'],
    priority: 3
  },
  'Real Estate': {
    patterns: [
      /real\s+estate/i,
      /property/i,
      /\breit\b/i,
      /real\s+property/i,
      /development\s+fund/i,
      /opportunity\s+zone/i,
      /commercial\s+property/i,
      /residential\s+property/i,
      /land\s+development/i,
      /core\s+plus/i,
      /value[\s\-]add/i
    ],
    keywords: ['real estate', 'property', 'reit', 'development', 'opportunity zone'],
    priority: 4
  },
  'Credit/Debt': {
    patterns: [
      /credit/i,
      /debt/i,
      /loan/i,
      /direct\s+lending/i,
      /distressed/i,
      /fixed\s+income/i,
      /senior\s+secured/i,
      /subordinated\s+debt/i,
      /bridge\s+loan/i,
      /structured\s+credit/i,
      /high\s+yield/i
    ],
    keywords: ['credit', 'debt', 'loan', 'lending', 'distressed', 'fixed income'],
    priority: 5
  },
  'Infrastructure': {
    patterns: [
      /infrastructure/i,
      /\binfra\b/i,
      /utility/i,
      /renewable\s+energy/i,
      /solar/i,
      /wind\s+farm/i,
      /transportation/i,
      /telecom/i,
      /energy\s+transition/i,
      /core\s+infrastructure/i
    ],
    keywords: ['infrastructure', 'renewable', 'energy', 'utility', 'transportation'],
    priority: 6
  },
  'Fund of Funds': {
    patterns: [
      /fund\s+of\s+funds/i,
      /\bfof\b/i,
      /multi[\s\-]manager/i,
      /feeder\s+fund/i,
      /master[\s\-]feeder/i,
      /fund\s+selection/i
    ],
    keywords: ['fund of funds', 'fof', 'multi-manager', 'feeder'],
    priority: 7
  },
  'Impact/ESG': {
    patterns: [
      /impact/i,
      /\besg\b/i,
      /sustainable/i,
      /social\s+impact/i,
      /environmental/i,
      /green\s+fund/i,
      /responsible\s+invest/i,
      /climate/i,
      /carbon\s+neutral/i,
      /sdg/i
    ],
    keywords: ['impact', 'esg', 'sustainable', 'social', 'environmental', 'green'],
    priority: 8
  },
  'Crypto/Digital Assets': {
    patterns: [
      /crypto/i,
      /blockchain/i,
      /digital\s+asset/i,
      /bitcoin/i,
      /ethereum/i,
      /defi/i,
      /web3/i,
      /token/i,
      /nft/i,
      /virtual\s+currency/i
    ],
    keywords: ['crypto', 'blockchain', 'digital asset', 'bitcoin', 'defi', 'web3'],
    priority: 9
  },
  'Commodities': {
    patterns: [
      /commodit/i,
      /natural\s+resource/i,
      /precious\s+metal/i,
      /gold/i,
      /oil\s+[&and]\s+gas/i,
      /energy\s+fund/i,
      /agriculture/i,
      /mining/i
    ],
    keywords: ['commodity', 'natural resource', 'precious metal', 'oil gas', 'mining'],
    priority: 10
  }
};

// Analyze fund name and narrative to determine best classification
function classifyFund(fundName, fundType, narrative = '') {
  const combinedText = `${fundName} ${fundType} ${narrative}`.toLowerCase();
  
  // Track scores for each classification
  const scores = {};
  
  for (const [classification, rules] of Object.entries(FUND_CLASSIFICATIONS)) {
    let score = 0;
    
    // Check patterns
    for (const pattern of rules.patterns) {
      if (pattern.test(combinedText)) {
        score += 10; // High weight for pattern matches
      }
    }
    
    // Check keywords
    for (const keyword of rules.keywords) {
      if (combinedText.includes(keyword)) {
        score += 5; // Medium weight for keyword matches
      }
    }
    
    // Boost score if it appears in fund name directly
    for (const pattern of rules.patterns) {
      if (pattern.test(fundName)) {
        score += 15; // Extra weight for fund name matches
      }
    }
    
    scores[classification] = score;
  }
  
  // Find the best match
  const bestMatch = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (bestMatch && bestMatch[1] >= 10) {
    return bestMatch[0];
  }
  
  // If no good match, try to improve generic classifications
  const fundTypeLower = (fundType || '').toLowerCase();
  
  if (fundTypeLower.includes('special situation')) {
    // Special situations often involve distressed or opportunistic investments
    if (combinedText.includes('distressed') || combinedText.includes('turnaround')) {
      return 'Credit/Debt';
    }
    if (combinedText.includes('opportun')) {
      return 'Private Equity';
    }
    return 'Alternative Investment';
  }
  
  if (fundTypeLower === 'investment fund' || fundTypeLower === 'other') {
    // Try to infer from fund name structure
    if (fundName.match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/) || 
        fundName.match(/\b(1|2|3|4|5|6|7|8|9|10)\b/)) {
      // Numbered funds are often PE or VC
      if (combinedText.includes('capital') || combinedText.includes('partner')) {
        return combinedText.includes('venture') ? 'Venture Capital' : 'Private Equity';
      }
    }
    return 'Alternative Investment';
  }
  
  // Keep original if it's already specific
  if (fundType && !['Special Situations Fund', 'Fund of Funds', 'Investment Fund', 'Other'].includes(fundType)) {
    return fundType;
  }
  
  return 'Alternative Investment';
}

// Enhanced classification with subcategories
function getDetailedClassification(fundName, fundType, narrative = '') {
  const mainType = classifyFund(fundName, fundType, narrative);
  const combinedText = `${fundName} ${fundType} ${narrative}`.toLowerCase();
  
  let subCategory = null;
  let investmentFocus = [];
  
  // Determine subcategories based on main type
  switch(mainType) {
    case 'Venture Capital':
      if (combinedText.includes('seed') || combinedText.includes('pre-seed')) {
        subCategory = 'Seed/Early Stage';
      } else if (combinedText.includes('series b') || combinedText.includes('series c') || combinedText.includes('growth')) {
        subCategory = 'Growth Stage';
      } else if (combinedText.includes('late stage')) {
        subCategory = 'Late Stage';
      } else {
        subCategory = 'Multi-Stage';
      }
      
      // Identify sector focus
      if (combinedText.includes('tech') || combinedText.includes('software')) investmentFocus.push('Technology');
      if (combinedText.includes('health') || combinedText.includes('bio')) investmentFocus.push('Healthcare');
      if (combinedText.includes('fintech')) investmentFocus.push('FinTech');
      if (combinedText.includes('climate') || combinedText.includes('clean')) investmentFocus.push('CleanTech');
      break;
      
    case 'Private Equity':
      if (combinedText.includes('middle market')) {
        subCategory = 'Middle Market';
      } else if (combinedText.includes('large cap')) {
        subCategory = 'Large Cap';
      } else if (combinedText.includes('small cap')) {
        subCategory = 'Small Cap';
      } else if (combinedText.includes('growth equity')) {
        subCategory = 'Growth Equity';
      } else {
        subCategory = 'Buyout';
      }
      break;
      
    case 'Hedge Fund':
      if (combinedText.includes('long/short') || combinedText.includes('long short')) {
        subCategory = 'Long/Short Equity';
      } else if (combinedText.includes('macro')) {
        subCategory = 'Global Macro';
      } else if (combinedText.includes('arbitrage')) {
        subCategory = 'Arbitrage';
      } else if (combinedText.includes('event')) {
        subCategory = 'Event-Driven';
      } else {
        subCategory = 'Multi-Strategy';
      }
      break;
      
    case 'Real Estate':
      if (combinedText.includes('residential')) {
        subCategory = 'Residential';
      } else if (combinedText.includes('commercial')) {
        subCategory = 'Commercial';
      } else if (combinedText.includes('industrial')) {
        subCategory = 'Industrial';
      } else if (combinedText.includes('retail')) {
        subCategory = 'Retail';
      } else {
        subCategory = 'Diversified';
      }
      break;
  }
  
  return {
    fund_type: mainType,
    fund_sub_category: subCategory,
    investment_focus: investmentFocus.length > 0 ? investmentFocus.join(', ') : null
  };
}

async function updateFundClassifications() {
  console.log('🚀 Starting fund classification update...\n');
  
  const logFile = path.join(__dirname, '../logs', `fund_classification_${new Date().toISOString().split('T')[0]}.log`);
  const logDir = path.dirname(logFile);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  
  function log(message) {
    console.log(message);
    logStream.write(`[${new Date().toISOString()}] ${message}\n`);
  }
  
  let processedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const batchSize = 100;
  let hasMore = true;
  let lastId = 0;
  
  // Track changes
  const changesByType = {};
  const improvedClassifications = [];
  
  while (hasMore) {
    try {
      // Fetch batch of funds
      const { data: funds, error: fetchError } = await supabase
        .from('ria_private_funds')
        .select('id, crd_number, fund_name, fund_type, fund_type_other')
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(batchSize);
      
      if (fetchError) {
        log(`❌ Error fetching funds: ${fetchError.message}`);
        break;
      }
      
      if (!funds || funds.length === 0) {
        hasMore = false;
        break;
      }
      
      lastId = funds[funds.length - 1].id;
      
      // Process each fund
      const updates = [];
      
      for (const fund of funds) {
        const oldType = fund.fund_type || 'Unclassified';
        
        // Get narrative for this RIA if available
        const { data: narrative } = await supabase
          .from('narratives')
          .select('narrative')
          .eq('crd_number', fund.crd_number)
          .single();
        
        const narrativeText = narrative?.narrative || '';
        
        // Get detailed classification
        const classification = getDetailedClassification(
          fund.fund_name,
          fund.fund_type,
          narrativeText
        );
        
        // Only update if classification changed or improved
        if (oldType !== classification.fund_type && 
            (oldType === 'Special Situations Fund' || 
             oldType === 'Fund of Funds' || 
             oldType === 'Investment Fund' ||
             oldType === 'Other' ||
             !oldType)) {
          
          updates.push({
            id: fund.id,
            fund_type: classification.fund_type,
            fund_type_other: classification.fund_sub_category
          });
          
          // Track the change
          const changeKey = `${oldType} → ${classification.fund_type}`;
          changesByType[changeKey] = (changesByType[changeKey] || 0) + 1;
          
          improvedClassifications.push({
            fund_name: fund.fund_name,
            old_type: oldType,
            new_type: classification.fund_type,
            sub_category: classification.fund_sub_category
          });
          
          log(`✅ Reclassified: "${fund.fund_name}" from "${oldType}" to "${classification.fund_type}" (${classification.fund_sub_category || 'no subcategory'})`);
        }
        
        processedCount++;
      }
      
      // Batch update
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('ria_private_funds')
            .update({
              fund_type: update.fund_type,
              fund_type_other: update.fund_type_other
            })
            .eq('id', update.id);
          
          if (updateError) {
            log(`❌ Error updating fund ${update.id}: ${updateError.message}`);
            errorCount++;
          } else {
            updatedCount++;
          }
        }
      }
      
      log(`📊 Progress: Processed ${processedCount} funds, updated ${updatedCount}`);
      
    } catch (error) {
      log(`❌ Batch error: ${error.message}`);
      errorCount++;
      hasMore = false;
    }
  }
  
  // Generate summary report
  log('\n' + '='.repeat(60));
  log('📊 CLASSIFICATION UPDATE SUMMARY');
  log('='.repeat(60));
  log(`Total funds processed: ${processedCount}`);
  log(`Total funds updated: ${updatedCount}`);
  log(`Total errors: ${errorCount}`);
  log(`Success rate: ${((updatedCount/processedCount)*100).toFixed(1)}%`);
  
  log('\n📈 Classification Changes:');
  Object.entries(changesByType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([change, count]) => {
      log(`  ${change}: ${count} funds`);
    });
  
  // Save detailed report
  const reportFile = path.join(__dirname, '../logs', `fund_classification_report_${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    summary: {
      processed: processedCount,
      updated: updatedCount,
      errors: errorCount,
      success_rate: ((updatedCount/processedCount)*100).toFixed(1) + '%'
    },
    changes_by_type: changesByType,
    sample_improvements: improvedClassifications.slice(0, 50)
  }, null, 2));
  
  log(`\n💾 Detailed report saved to: ${reportFile}`);
  
  logStream.end();
  
  return {
    processed: processedCount,
    updated: updatedCount,
    errors: errorCount
  };
}

// Main execution
async function main() {
  console.log('🔧 Fund Type Classification Fix');
  console.log('================================\n');
  
  try {
    const result = await updateFundClassifications();
    
    console.log('\n✅ Classification update completed!');
    console.log(`   Processed: ${result.processed} funds`);
    console.log(`   Updated: ${result.updated} funds`);
    console.log(`   Errors: ${result.errors}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { classifyFund, getDetailedClassification };
