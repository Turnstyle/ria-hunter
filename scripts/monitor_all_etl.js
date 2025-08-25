/**
 * Continuous ETL Monitoring Script
 * Runs continuously, checking ETL progress at regular intervals
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CHECK_INTERVAL_MINUTES = 5;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'etl_monitoring.log');
const MAX_RUNTIME_HOURS = 48; // Maximum runtime to prevent indefinite execution

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Run the ETL progress check and capture output
 */
function checkETLProgress() {
  try {
    const output = execSync('node scripts/check_etl_progress.js', { encoding: 'utf8' });
    return output;
  } catch (error) {
    return `Error checking ETL progress: ${error.message}`;
  }
}

/**
 * Log progress to file
 */
function logProgress(progress) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n\n=== ETL PROGRESS CHECK: ${timestamp} ===\n${progress}\n`;
  
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(`Progress logged to ${LOG_FILE}`);
}

/**
 * Check ETL process status
 */
function checkProcessStatus() {
  const processesToCheck = [
    { name: 'Narrative Generation 1', pattern: 'etl_narrative_generator.js --start-crd 1000 --end-crd 17000' },
    { name: 'Narrative Generation 2', pattern: 'etl_narrative_generator.js --start-crd 17001 --end-crd 33000' },
    { name: 'Narrative Generation 3', pattern: 'etl_narrative_generator.js --start-crd 33001 --end-crd 49000' },
    { name: 'Narrative Generation 4', pattern: 'etl_narrative_generator.js --start-crd 49001 --end-crd 66000' },
    { name: 'Private Funds ETL', pattern: 'backfill_private_funds.ts' },
    { name: 'Control Persons ETL', pattern: 'backfill_control_persons.ts' },
    { name: 'Metadata Enhancement', pattern: 'enhance_ria_metadata.ts' }
  ];
  
  let statusOutput = '=== PROCESS STATUS ===\n';
  
  for (const process of processesToCheck) {
    try {
      // Use ps command to check if process is running
      const grepCmd = `ps aux | grep "${process.pattern}" | grep -v grep`;
      const result = execSync(grepCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      
      if (result && result.trim()) {
        statusOutput += `✅ ${process.name}: RUNNING\n`;
      } else {
        statusOutput += `❌ ${process.name}: NOT RUNNING\n`;
      }
    } catch (error) {
      // If grep doesn't find anything, it returns non-zero exit code
      statusOutput += `❌ ${process.name}: NOT RUNNING\n`;
    }
  }
  
  return statusOutput;
}

/**
 * Check for new log entries
 */
function checkLogFiles() {
  const logFiles = [
    'narrative_1000_17000.log',
    'narrative_17001_33000.log', 
    'narrative_33001_49000.log',
    'narrative_49001_66000.log',
    'private_funds_etl.log',
    'control_persons_etl.log',
    'metadata_enhancement.log'
  ];
  
  let logOutput = '=== RECENT LOG ACTIVITY ===\n';
  
  for (const logFile of logFiles) {
    const logPath = path.join(logsDir, logFile);
    if (fs.existsSync(logPath)) {
      try {
        // Get last 5 lines of each log file
        const tailCmd = process.platform === 'win32' 
          ? `powershell -command "Get-Content -Tail 5 ${logPath}"` 
          : `tail -5 ${logPath}`;
        
        const lastLines = execSync(tailCmd, { encoding: 'utf8' });
        
        logOutput += `\n--- ${logFile} (last activity) ---\n`;
        logOutput += lastLines.trim() + '\n';
      } catch (error) {
        logOutput += `\n--- ${logFile} ---\n`;
        logOutput += `Error reading log: ${error.message}\n`;
      }
    } else {
      logOutput += `\n--- ${logFile} ---\n`;
      logOutput += 'Log file does not exist yet\n';
    }
  }
  
  return logOutput;
}

/**
 * Main monitoring loop
 */
async function monitorETL() {
  console.log(`Starting ETL monitoring - checking every ${CHECK_INTERVAL_MINUTES} minutes`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log(`Maximum runtime: ${MAX_RUNTIME_HOURS} hours`);
  console.log('Press Ctrl+C to stop monitoring');
  
  // Clear or create log file
  fs.writeFileSync(LOG_FILE, `ETL MONITORING STARTED: ${new Date().toISOString()}\n`);
  
  const startTime = new Date();
  let checkCount = 0;
  
  // Initial check
  console.log('\nPerforming initial ETL progress check...');
  const initialProgress = checkETLProgress();
  const initialStatus = checkProcessStatus();
  const initialLogs = checkLogFiles();
  logProgress(initialProgress + '\n' + initialStatus + '\n' + initialLogs);
  checkCount++;
  
  // Set up interval for periodic checks
  const intervalId = setInterval(() => {
    // Check if we've exceeded the maximum runtime
    const currentTime = new Date();
    const runtimeHours = (currentTime - startTime) / (1000 * 60 * 60);
    
    if (runtimeHours > MAX_RUNTIME_HOURS) {
      console.log(`Maximum runtime of ${MAX_RUNTIME_HOURS} hours reached. Stopping monitoring.`);
      clearInterval(intervalId);
      return;
    }
    
    console.log(`\nPerforming ETL progress check #${checkCount + 1}...`);
    const progress = checkETLProgress();
    const status = checkProcessStatus();
    const logs = checkLogFiles();
    logProgress(progress + '\n' + status + '\n' + logs);
    checkCount++;
  }, CHECK_INTERVAL_MINUTES * 60 * 1000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nMonitoring stopped by user');
    clearInterval(intervalId);
    process.exit(0);
  });
}

// Start monitoring
monitorETL().catch(error => {
  console.error('Error in ETL monitoring:', error);
});
