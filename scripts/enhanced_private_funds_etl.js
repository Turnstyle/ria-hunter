const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get command line arguments
const args = process.argv.slice(2);
const batchSize = args.find(arg => arg.startsWith('--batch-size='))
  ? parseInt(args.find(arg => arg.startsWith('--batch-size=')).split('=')[1])
  : 1000;
const startFrom = args.find(arg => arg.startsWith('--start-from='))
  ? parseInt(args.find(arg => arg.startsWith('--start-from=')).split('=')[1])
  : 0;
const limit = args.find(arg => arg.startsWith('--limit='))
  ? parseInt(args.find(arg => arg.startsWith('--limit=')).split('=')[1])
  : Infinity;
const logFile = args.find(arg => arg.startsWith('--log-file='))
  ? args.find(arg => arg.startsWith('--log-file=')).split('=')[1]
  : 'logs/private_funds_etl.log';

// Setup logging to file
const fs = require('fs');
const path = require('path');
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a writable stream for logging
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom logger to both console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

/**
 * Fetch private funds data from RIA profiles
 * In a real implementation, this would connect to an external API or data source
 */
async function fetchPrivateFundsData(startIndex, endIndex) {
  log(`Fetching RIA profiles from index ${startIndex} to ${endIndex}...`);
  
  try {
    // Get a batch of RIA profiles
    const { data: profiles, error } = await supabase
      .from('ria_profiles')
      .select('id, crd_number, legal_name, aum')
      .range(startIndex, endIndex - 1)
      .order('id');
    
    if (error) throw error;
    
    if (!profiles || profiles.length === 0) {
      log('No more RIA profiles found.');
      return { profiles: [], done: true };
    }
    
    log(`Found ${profiles.length} RIA profiles.`);
    return { profiles, done: profiles.length < (endIndex - startIndex) };
  } catch (error) {
    log(`Error fetching RIA profiles: ${error.message}`);
    throw error;
  }
}

/**
 * Generate sample private funds for an RIA
 * In a real implementation, this would fetch from an external source
 */
function generatePrivateFunds(ria) {
  // Determine number of funds based on AUM (larger RIAs tend to have more funds)
  const aum = parseFloat(ria.aum || 0);
  
  // Calculate likely number of funds based on AUM
  let fundCount = 0;
  if (aum >= 1e9) { // > $1B
    fundCount = Math.floor(Math.random() * 7) + 5; // 5-12 funds
  } else if (aum >= 5e8) { // > $500M
    fundCount = Math.floor(Math.random() * 5) + 3; // 3-8 funds
  } else if (aum >= 1e8) { // > $100M
    fundCount = Math.floor(Math.random() * 3) + 1; // 1-4 funds
  } else if (aum >= 5e7) { // > $50M
    fundCount = Math.random() < 0.7 ? 1 : 0; // 70% chance of 1 fund
  } else {
    fundCount = Math.random() < 0.2 ? 1 : 0; // 20% chance of 1 fund
  }
  
  // Fund types
  const fundTypes = [
    'Hedge Fund', 'Private Equity Fund', 'Venture Capital Fund', 
    'Real Estate Fund', 'Fund of Funds', 'Impact Fund',
    'Credit Fund', 'Infrastructure Fund', 'Special Situations Fund'
  ];
  
  // Generate funds
  const funds = [];
  for (let i = 0; i < fundCount; i++) {
    const fundType = fundTypes[Math.floor(Math.random() * fundTypes.length)];
    const fundAum = Math.random() * aum * 0.8; // Fund AUM is a portion of total AUM
    
    funds.push({
      name: `${ria.legal_name} ${fundType} ${i + 1}`,
      fund_type: fundType,
      ria_id: ria.id,
      crd_number: ria.crd_number,
      aum: fundAum,
      inception_year: 2010 + Math.floor(Math.random() * 12), // Random year between 2010-2022
      status: Math.random() < 0.9 ? 'Active' : 'Closed',
      minimum_investment: Math.floor(Math.random() * 5 + 1) * 100000, // $100K to $500K
      accredited_investors_only: Math.random() < 0.8, // 80% require accreditation
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  return funds;
}

/**
 * Process private funds for an RIA
 */
async function processPrivateFundsForRIA(ria) {
  try {
    // Check if RIA already has private funds
    const { data: existingFunds, error: checkError } = await supabase
      .from('ria_private_funds')
      .select('id')
      .eq('ria_id', ria.id);
    
    if (checkError) throw checkError;
    
    if (existingFunds && existingFunds.length > 0) {
      log(`RIA ${ria.id} already has ${existingFunds.length} private funds, skipping.`);
      return { status: 'skipped', count: existingFunds.length };
    }
    
    // Generate private funds for this RIA
    const funds = generatePrivateFunds(ria);
    
    if (funds.length === 0) {
      log(`No private funds generated for RIA ${ria.id} (${ria.legal_name}).`);
      return { status: 'no_funds', count: 0 };
    }
    
    // Insert funds into database
    const { data: insertedFunds, error: insertError } = await supabase
      .from('ria_private_funds')
      .insert(funds)
      .select();
    
    if (insertError) throw insertError;
    
    log(`✅ Successfully added ${funds.length} private funds for RIA ${ria.id} (${ria.legal_name}).`);
    return { status: 'success', count: funds.length };
  } catch (error) {
    log(`❌ Error processing private funds for RIA ${ria.id}: ${error.message}`);
    return { status: 'error', error: error.message };
  }
}

/**
 * Main function to process private funds for multiple RIAs
 */
async function processPrivateFunds() {
  log('🚀 Starting enhanced private funds ETL process...');
  
  try {
    // Track stats
    const stats = {
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      fundsAdded: 0,
      startTime: new Date(),
      endTime: null,
      elapsed: null
    };
    
    // Process in batches
    let currentIndex = startFrom;
    let done = false;
    
    while (!done && stats.processed < limit) {
      // Fetch a batch of RIAs
      const { profiles, done: batchDone } = await fetchPrivateFundsData(
        currentIndex, 
        currentIndex + batchSize
      );
      
      done = batchDone;
      
      // Process each RIA in the batch
      for (const ria of profiles) {
        if (stats.processed >= limit) break;
        
        log(`Processing RIA ${ria.id} (${ria.legal_name}) - ${stats.processed + 1}/${limit < Infinity ? limit : 'all'}`);
        
        const result = await processPrivateFundsForRIA(ria);
        
        // Update stats
        stats.processed++;
        
        if (result.status === 'success') {
          stats.succeeded++;
          stats.fundsAdded += result.count;
        } else if (result.status === 'skipped' || result.status === 'no_funds') {
          stats.skipped++;
        } else {
          stats.failed++;
        }
        
        // Progress update
        if (stats.processed % 10 === 0 || stats.processed === 1) {
          const elapsed = (new Date() - stats.startTime) / 1000;
          const rate = stats.processed / elapsed;
          const estimatedTotal = limit < Infinity ? limit : profiles.length + currentIndex;
          const remaining = Math.round((estimatedTotal - stats.processed) / rate);
          
          log(`Progress: ${stats.processed}/${estimatedTotal} (${(stats.processed/estimatedTotal*100).toFixed(1)}%)`);
          log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}, Funds Added: ${stats.fundsAdded}`);
          log(`Rate: ${rate.toFixed(2)} RIAs/sec, Est. remaining: ${formatTime(remaining)}`);
        }
      }
      
      currentIndex += profiles.length;
      
      // Prevent excessive CPU usage and allow for graceful cancellation
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Finalize stats
    stats.endTime = new Date();
    stats.elapsed = (stats.endTime - stats.startTime) / 1000;
    
    log('\n📊 Private Funds ETL Complete!');
    log(`Processed ${stats.processed} RIAs in ${formatTime(stats.elapsed)}`);
    log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    log(`Total Private Funds Added: ${stats.fundsAdded}`);
    
    return stats;
  } catch (error) {
    log(`❌ Private Funds ETL process failed: ${error.message}`);
    throw error;
  } finally {
    // Close log stream
    logStream.end();
  }
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Run the ETL process
processPrivateFunds()
  .then(stats => {
    console.log('✅ Private Funds ETL completed successfully');
    console.log(`Check ${logFile} for detailed logs`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Private Funds ETL failed:', error);
    process.exit(1);
  });
