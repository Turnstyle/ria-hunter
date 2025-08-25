const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initial state to track changes
let previousCounts = {
  narratives: 0,
  control_persons: 0,
  private_funds: 0
};

// Function to format numbers with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Check database table record counts
async function checkRecordCounts() {
  try {
    console.clear();
    console.log('📊 ETL Progress Monitor - ' + new Date().toLocaleString());
    console.log('='.repeat(60));

    // Get RIA profiles count
    const { count: riaCount, error: riaError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
    
    if (riaError) throw riaError;
    
    // Get narratives count
    const { count: narrativesCount, error: narrativesError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
    
    if (narrativesError) throw narrativesError;
    
    // Get control persons count
    const { count: controlPersonsCount, error: cpError } = await supabase
      .from('control_persons')
      .select('*', { count: 'exact', head: true });
    
    if (cpError) throw cpError;
    
    // Get private funds count
    const { count: privateFundsCount, error: pfError } = await supabase
      .from('ria_private_funds')
      .select('*', { count: 'exact', head: true });
    
    if (pfError) throw pfError;
    
    // Calculate changes since last check
    const narrativesDelta = narrativesCount - previousCounts.narratives;
    const controlPersonsDelta = controlPersonsCount - previousCounts.control_persons;
    const privateFundsDelta = privateFundsCount - previousCounts.private_funds;
    
    // Update previous counts
    previousCounts = {
      narratives: narrativesCount,
      control_persons: controlPersonsCount,
      private_funds: privateFundsCount
    };
    
    // Calculate coverage percentages
    const narrativesCoverage = (narrativesCount / riaCount * 100).toFixed(2);
    const controlPersonsCoverage = (controlPersonsCount / riaCount * 100).toFixed(2);
    const privateFundsCoverage = (privateFundsCount / riaCount * 100).toFixed(2);
    
    // Display counts and changes
    console.log(`Total RIA Profiles: ${formatNumber(riaCount)}`);
    console.log('-'.repeat(60));
    console.log(`Narratives: ${formatNumber(narrativesCount)} (${narrativesCoverage}% coverage)`);
    console.log(`  Δ ${narrativesDelta >= 0 ? '+' : ''}${formatNumber(narrativesDelta)} since last check`);
    console.log(`Control Persons: ${formatNumber(controlPersonsCount)} (${controlPersonsCoverage}% coverage)`);
    console.log(`  Δ ${controlPersonsDelta >= 0 ? '+' : ''}${formatNumber(controlPersonsDelta)} since last check`);
    console.log(`Private Funds: ${formatNumber(privateFundsCount)} (${privateFundsCoverage}% coverage)`);
    console.log(`  Δ ${privateFundsDelta >= 0 ? '+' : ''}${formatNumber(privateFundsDelta)} since last check`);
    console.log('-'.repeat(60));
    
    // Show active processes
    console.log('Active ETL Processes:');
    // This would normally show active processes, but we can't directly access
    // process info from Node.js easily. Consider implementing a more robust
    // tracking mechanism if needed.
    
    console.log('='.repeat(60));
    console.log('Press Ctrl+C to exit monitor');
    
  } catch (error) {
    console.error('Error checking record counts:', error);
  }
}

// Run initial check
checkRecordCounts();

// Set up interval for continuous monitoring
const intervalMinutes = 1;
console.log(`\nMonitoring ETL progress every ${intervalMinutes} minute(s)...`);
setInterval(checkRecordCounts, intervalMinutes * 60 * 1000);
