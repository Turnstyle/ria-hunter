const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Helper to get color based on percentage
function getColorForPercentage(percentage) {
  if (percentage >= 90) return colors.green;
  if (percentage >= 50) return colors.yellow;
  return colors.red;
}

// Check ETL progress
async function checkETLProgress() {
  console.log(`${colors.bright}${colors.magenta}RIA Hunter ETL Progress Check${colors.reset}`);
  console.log(`${colors.dim}Started at: ${new Date().toISOString()}${colors.reset}\n`);
  
  try {
    // Get current counts for each table
    const [
      riaProfilesResult,
      narrativesResult,
      controlPersonsResult,
      privateFundsResult
    ] = await Promise.all([
      supabase.from('ria_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('narratives').select('*', { count: 'exact', head: true }),
      supabase.from('control_persons').select('*', { count: 'exact', head: true }),
      supabase.from('ria_private_funds').select('*', { count: 'exact', head: true })
    ]);
    
    const riaCount = riaProfilesResult.count || 0;
    const narrativeCount = narrativesResult.count || 0;
    const controlPersonsCount = controlPersonsResult.count || 0;
    const privateFundsCount = privateFundsResult.count || 0;
    
    // Calculate coverage percentages
    const narrativeCoverage = riaCount > 0 ? (narrativeCount / riaCount * 100).toFixed(1) : 0;
    const controlPersonsCoverage = riaCount > 0 ? (controlPersonsCount / riaCount * 100).toFixed(1) : 0;
    
    // Expected counts
    const expectedRias = 103620;
    const expectedNarratives = expectedRias; // 1:1 mapping
    const expectedControlPersons = 15000; // Estimated
    const expectedPrivateFunds = 100000; // Estimated
    
    // Check for embedding completeness
    const { data: narrativesWithoutEmbeddings, error: embeddingError } = await supabase
      .from('narratives')
      .select('id')
      .is('embedding_vector', null)
      .limit(5);
    
    if (embeddingError) throw embeddingError;
    
    // Count RIAs missing narratives
    const { data: riasWithoutNarratives, error: missingError } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .not('crd_number', 'in', supabase.from('narratives').select('crd_number'))
      .limit(5);
    
    if (missingError) {
      console.log(`${colors.yellow}Unable to calculate missing narratives: ${missingError.message}${colors.reset}`);
    }
    
    // Display the dashboard
    console.log(`${colors.bright}${colors.blue}ETL Progress Summary:${colors.reset}\n`);
    
    console.log(`${colors.bright}RIA Profiles:${colors.reset} ${riaCount.toLocaleString()} / ${expectedRias.toLocaleString()} ${getColorForPercentage((riaCount / expectedRias) * 100)}(${((riaCount / expectedRias) * 100).toFixed(1)}%)${colors.reset}`);
    
    console.log(`${colors.bright}Narratives:${colors.reset} ${narrativeCount.toLocaleString()} / ${expectedNarratives.toLocaleString()} ${getColorForPercentage(narrativeCoverage)}(${narrativeCoverage}%)${colors.reset}`);
    
    console.log(`${colors.bright}Control Persons:${colors.reset} ${controlPersonsCount.toLocaleString()} / ~${expectedControlPersons.toLocaleString()} ${getColorForPercentage(controlPersonsCoverage)}(${controlPersonsCoverage}%)${colors.reset}`);
    
    console.log(`${colors.bright}Private Funds:${colors.reset} ${privateFundsCount.toLocaleString()} / ~${expectedPrivateFunds.toLocaleString()} ${getColorForPercentage((privateFundsCount / expectedPrivateFunds) * 100)}(${((privateFundsCount / expectedPrivateFunds) * 100).toFixed(1)}%)${colors.reset}`);
    
    console.log(`${colors.bright}Embedding Status:${colors.reset} ${narrativesWithoutEmbeddings && narrativesWithoutEmbeddings.length > 0 ? colors.yellow + 'Incomplete' : colors.green + 'Complete'}${colors.reset}`);
    
    // Missing Data Analysis
    console.log(`\n${colors.bright}${colors.blue}Missing Data Analysis:${colors.reset}`);
    
    // Calculate missing narratives
    const missingNarrativesCount = riaCount - narrativeCount;
    console.log(`${colors.bright}RIAs Missing Narratives:${colors.reset} ${missingNarrativesCount.toLocaleString()} (${(missingNarrativesCount / riaCount * 100).toFixed(1)}%)`);
    
    if (riasWithoutNarratives && riasWithoutNarratives.length > 0) {
      console.log(`${colors.dim}Sample missing CRDs: ${riasWithoutNarratives.slice(0, 5).map(r => r.crd_number).join(', ')}${colors.reset}`);
    }
    
    // Recommendations
    console.log(`\n${colors.bright}${colors.blue}Recommendations:${colors.reset}`);
    
    // Provide recommendations based on status
    if (narrativeCoverage < 95) {
      console.log(`${colors.yellow}• Run the unified load + embedding pipeline to increase coverage${colors.reset}`);
      console.log(`  LOAD_LIMIT=1000 npx tsx scripts/load_and_embed_data.ts`);
    }
    
    if (controlPersonsCoverage < 50) {
      console.log(`${colors.yellow}• Run enhanced control persons ETL${colors.reset}`);
      console.log(`  node scripts/backfill_control_persons_fixed.js`);
    }
    
    if ((privateFundsCount / expectedPrivateFunds) * 100 < 50) {
      console.log(`${colors.yellow}• Run enhanced private funds ETL${colors.reset}`);
      console.log(`  node scripts/enhanced_private_funds_etl.js --batch-size=1000 --limit=10000`);
    }
    
    if (narrativesWithoutEmbeddings && narrativesWithoutEmbeddings.length > 0) {
      console.log(`${colors.yellow}• Fix narratives with missing embeddings${colors.reset}`);
      console.log(`  node scripts/fix_missing_embeddings.js`);
    }
    
    // Process status
    const overallStatus = 
      narrativeCoverage >= 95 && 
      controlPersonsCoverage >= 50 && 
      (privateFundsCount / expectedPrivateFunds) * 100 >= 50 && 
      (!narrativesWithoutEmbeddings || narrativesWithoutEmbeddings.length === 0)
        ? `${colors.green}GOOD${colors.reset}`
        : narrativeCoverage >= 50
          ? `${colors.yellow}IN PROGRESS${colors.reset}`
          : `${colors.red}NEEDS ATTENTION${colors.reset}`;
    
    console.log(`\n${colors.bright}Overall ETL Status: ${overallStatus}`);
    
    return {
      riaCount,
      narrativeCount,
      narrativeCoverage: parseFloat(narrativeCoverage),
      controlPersonsCount,
      controlPersonsCoverage: parseFloat(controlPersonsCoverage),
      privateFundsCount,
      privateFundsCoverage: (privateFundsCount / expectedPrivateFunds) * 100,
      hasIncompleteEmbeddings: narrativesWithoutEmbeddings && narrativesWithoutEmbeddings.length > 0,
      overallStatus: overallStatus.includes('GOOD') ? 'GOOD' : overallStatus.includes('IN PROGRESS') ? 'IN PROGRESS' : 'NEEDS ATTENTION'
    };
  } catch (error) {
    console.error(`${colors.red}Error checking ETL progress:${colors.reset}`, error);
    throw error;
  }
}

// Get running ETL processes
async function checkRunningProcesses() {
  console.log(`\n${colors.bright}${colors.blue}ETL Process Check:${colors.reset}`);
  
  try {
    // Look for narrative generation processes
    const { stdout: psOutput } = await execPromise('ps aux | grep narrative_generator | grep -v grep');
    
    const runningProcesses = psOutput.split('\n').filter(Boolean);
    
    if (runningProcesses.length > 0) {
      console.log(`${colors.green}Found ${runningProcesses.length} narrative generation processes running:${colors.reset}`);
      
      runningProcesses.forEach((process, index) => {
        const processInfo = process.split(/\s+/).slice(0, 11).join(' ');
        console.log(`${colors.dim}${index + 1}. ${processInfo}${colors.reset}`);
      });
    } else {
      console.log(`${colors.yellow}No narrative generation processes currently running${colors.reset}`);
    }
    
    // Check log files for progress
    console.log(`\n${colors.bright}${colors.blue}ETL Log Status:${colors.reset}`);
    
    const { stdout: lsOutput } = await execPromise('ls -lh logs/ 2>/dev/null || echo "No logs directory found"');
    
    console.log(`${colors.dim}${lsOutput}${colors.reset}`);
    
    // Check most recent log activity
    if (!lsOutput.includes('No logs directory found')) {
      try {
        const { stdout: tailOutput } = await execPromise('tail -n 5 logs/narrative_*.log 2>/dev/null || echo "No narrative logs found"');
        
        if (!tailOutput.includes('No narrative logs found')) {
          console.log(`\n${colors.bright}Recent Log Activity:${colors.reset}`);
          console.log(`${colors.dim}${tailOutput}${colors.reset}`);
        }
      } catch (error) {
        // Ignore errors in log checking
      }
    }
    
    return {
      runningProcesses: runningProcesses.length
    };
  } catch (error) {
    console.log(`${colors.yellow}Unable to check running processes: ${error.message}${colors.reset}`);
    return { runningProcesses: 0 };
  }
}

// Promisified exec
function execPromise(command) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error && error.code !== 1) { // Ignore grep returning 1 for no matches
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Run the check
async function main() {
  try {
    const progress = await checkETLProgress();
    await checkRunningProcesses();
    
    console.log(`\n${colors.dim}Check completed at: ${new Date().toISOString()}${colors.reset}`);
    
    // Exit with status code based on progress
    process.exit(progress.overallStatus === 'GOOD' ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Check failed:${colors.reset}`, error);
    process.exit(1);
  }
}

// Execute
main();
