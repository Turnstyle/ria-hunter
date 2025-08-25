const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure processes to run
const processes = [
  {
    name: 'Missing Narratives Identification',
    command: 'node',
    args: ['scripts/identify_missing_narratives.js'],
    logFile: 'logs/missing_narratives.log',
    required: true,
    status: 'pending'
  },
  {
    name: 'Narrative Generation Batch 1',
    command: 'node',
    args: ['scripts/targeted_narrative_generator.js', '--batch=1'],
    logFile: 'logs/narrative_batch_1.log',
    env: { AI_PROVIDER: 'google' },
    dependsOn: 'Missing Narratives Identification',
    status: 'pending'
  },
  {
    name: 'Narrative Generation Batch 2',
    command: 'node',
    args: ['scripts/targeted_narrative_generator.js', '--batch=2'],
    logFile: 'logs/narrative_batch_2.log',
    env: { AI_PROVIDER: 'google' },
    dependsOn: 'Missing Narratives Identification',
    status: 'pending'
  },
  {
    name: 'Narrative Generation Batch 3',
    command: 'node',
    args: ['scripts/targeted_narrative_generator.js', '--batch=3'],
    logFile: 'logs/narrative_batch_3.log',
    env: { AI_PROVIDER: 'google' },
    dependsOn: 'Missing Narratives Identification',
    status: 'pending'
  },
  {
    name: 'Narrative Generation Batch 4',
    command: 'node',
    args: ['scripts/targeted_narrative_generator.js', '--batch=4'],
    logFile: 'logs/narrative_batch_4.log',
    env: { AI_PROVIDER: 'google' },
    dependsOn: 'Missing Narratives Identification',
    status: 'pending'
  },
  {
    name: 'Control Persons ETL',
    command: 'node',
    args: ['scripts/document_ai_control_persons.js'],
    logFile: 'logs/control_persons_etl.log',
    status: 'pending'
  },
  {
    name: 'Private Funds ETL',
    command: 'node',
    args: ['scripts/document_ai_private_funds.js'],
    logFile: 'logs/private_funds_etl.log',
    status: 'pending'
  }
];

// Colors for terminal output
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

// Logging utility
function log(message, color = colors.reset) {
  const timestamp = new Date().toISOString();
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
  
  // Also log to master log file
  fs.appendFileSync(path.join(logsDir, 'etl_master.log'), `[${timestamp}] ${message}\n`);
}

// Function to check if a script exists
function scriptExists(scriptPath) {
  return fs.existsSync(path.join(__dirname, scriptPath));
}

// Function to run a process and return a promise
function runProcess(process) {
  return new Promise((resolve, reject) => {
    log(`Starting ${process.name}...`, colors.cyan);
    
    // Create log file stream
    const logStream = fs.createWriteStream(path.join(__dirname, '..', process.logFile), { flags: 'a' });
    
    // Prepare environment variables
    const env = { 
      ...process.env,
      ...process.env
    };
    
    // Spawn the process
    const childProcess = spawn(process.command, process.args, { 
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Capture output
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      logStream.write(output);
      
      // Log important messages to console
      if (output.includes('✅') || output.includes('❌') || output.includes('⚠️')) {
        log(`[${process.name}] ${output.trim()}`, output.includes('✅') ? colors.green : output.includes('❌') ? colors.red : colors.yellow);
      }
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      logStream.write(output);
      log(`[${process.name}] ERROR: ${output.trim()}`, colors.red);
    });
    
    // Handle completion
    childProcess.on('close', (code) => {
      log(`${process.name} completed with code ${code}`, code === 0 ? colors.green : colors.red);
      logStream.end();
      
      if (code === 0) {
        resolve({ process, success: true });
      } else {
        resolve({ process, success: false, exitCode: code });
      }
    });
    
    childProcess.on('error', (error) => {
      log(`${process.name} failed to start: ${error.message}`, colors.red);
      logStream.end();
      resolve({ process, success: false, error: error.message });
    });
  });
}

// Function to check ETL progress
async function checkETLProgress() {
  log('Checking current ETL progress...', colors.magenta);
  
  try {
    // Run the check_etl_progress.js script to get current status
    const result = execSync('node scripts/check_etl_progress.js').toString();
    
    // Extract important stats from output
    const lines = result.split('\n');
    const statsLines = lines.filter(line => 
      line.includes('RIA Profiles:') || 
      line.includes('Narratives:') || 
      line.includes('Control Persons:') || 
      line.includes('Private Funds:') ||
      line.includes('Overall ETL Status:')
    );
    
    log('Current ETL Status:', colors.bright);
    statsLines.forEach(line => {
      if (line.includes('GOOD')) {
        log(line, colors.green);
      } else if (line.includes('IN PROGRESS')) {
        log(line, colors.yellow);
      } else if (line.includes('NEEDS ATTENTION')) {
        log(line, colors.red);
      } else {
        log(line);
      }
    });
    
    return {
      completed: result.includes('Overall ETL Status: GOOD'),
      inProgress: result.includes('Overall ETL Status: IN PROGRESS'),
      needsAttention: result.includes('Overall ETL Status: NEEDS ATTENTION')
    };
  } catch (error) {
    log(`Error checking ETL progress: ${error.message}`, colors.red);
    return { error: error.message };
  }
}

// Check if required scripts exist
function validateScripts() {
  const requiredScripts = [
    'identify_missing_narratives.js', 
    'targeted_narrative_generator.js',
    'document_ai_control_persons.js',
    'document_ai_private_funds.js',
    'check_etl_progress.js'
  ];
  
  const missingScripts = requiredScripts.filter(script => !scriptExists(script));
  
  if (missingScripts.length > 0) {
    log(`Missing required scripts: ${missingScripts.join(', ')}`, colors.red);
    return false;
  }
  
  return true;
}

// Main function to orchestrate all ETL processes
async function runAllETLProcesses() {
  log('🚀 Starting RIA Hunter ETL orchestration', colors.bright + colors.magenta);
  
  // Check if required scripts exist
  if (!validateScripts()) {
    log('❌ Cannot proceed due to missing scripts', colors.red);
    process.exit(1);
  }
  
  // Check current progress
  const initialProgress = await checkETLProgress();
  
  // Track overall stats
  const stats = {
    startTime: new Date(),
    processesSucceeded: 0,
    processesFailed: 0,
    endTime: null,
    elapsedTime: null,
    results: []
  };
  
  // Run processes in order, respecting dependencies
  const pendingProcesses = [...processes];
  const completedProcesses = new Set();
  
  while (pendingProcesses.length > 0) {
    // Find processes that can run (no dependencies or dependencies satisfied)
    const runnableProcesses = pendingProcesses.filter(process => {
      return !process.dependsOn || completedProcesses.has(process.dependsOn);
    });
    
    if (runnableProcesses.length === 0) {
      log('⚠️ Deadlock detected - no runnable processes but still have pending processes', colors.yellow);
      break;
    }
    
    log(`Running ${runnableProcesses.length} processes in parallel...`, colors.blue);
    
    // Run processes in parallel
    const results = await Promise.all(runnableProcesses.map(runProcess));
    
    // Process results
    for (const result of results) {
      const process = result.process;
      const index = pendingProcesses.findIndex(p => p.name === process.name);
      
      if (index !== -1) {
        // Remove from pending
        pendingProcesses.splice(index, 1);
        
        // Add to completed
        completedProcesses.add(process.name);
        
        // Update stats
        if (result.success) {
          stats.processesSucceeded++;
          log(`✅ ${process.name} completed successfully`, colors.green);
        } else {
          stats.processesFailed++;
          log(`❌ ${process.name} failed: ${result.error || `Exit code ${result.exitCode}`}`, colors.red);
          
          // If a required process fails, exit
          if (process.required) {
            log(`❌ Required process ${process.name} failed, cannot continue`, colors.red);
            break;
          }
        }
        
        stats.results.push({
          name: process.name,
          success: result.success,
          error: result.error,
          exitCode: result.exitCode
        });
      }
    }
    
    // Check if we're done
    if (pendingProcesses.length === 0) {
      log('All processes completed!', colors.green);
      break;
    }
    
    // Small delay before next batch
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final status check
  const finalProgress = await checkETLProgress();
  
  // Final stats
  stats.endTime = new Date();
  stats.elapsedTime = (stats.endTime - stats.startTime) / 1000;
  
  log('\n📊 ETL Orchestration Complete!', colors.bright + colors.magenta);
  log(`Total processes: ${processes.length}`, colors.bright);
  log(`Successful: ${stats.processesSucceeded}`, colors.green);
  log(`Failed: ${stats.processesFailed}`, colors.red);
  log(`Elapsed time: ${formatTime(stats.elapsedTime)}`, colors.bright);
  
  // Write final report
  const report = {
    startTime: stats.startTime.toISOString(),
    endTime: stats.endTime.toISOString(),
    elapsedTime: stats.elapsedTime,
    totalProcesses: processes.length,
    successful: stats.processesSucceeded,
    failed: stats.processesFailed,
    results: stats.results,
    initialProgress,
    finalProgress
  };
  
  fs.writeFileSync(
    path.join(logsDir, 'etl_report.json'), 
    JSON.stringify(report, null, 2)
  );
  
  log(`Report written to logs/etl_report.json`, colors.bright);
  
  // Next steps
  log('\nNext steps:', colors.bright);
  log('1. Check logs/etl_report.json for detailed results');
  log('2. Run node scripts/check_etl_progress.js to see current ETL status');
  log('3. For any failed processes, check their individual log files');
  
  return stats;
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Run the orchestrator
runAllETLProcesses()
  .then(() => {
    log('ETL orchestration completed', colors.green);
    process.exit(0);
  })
  .catch((error) => {
    log(`ETL orchestration failed: ${error.message}`, colors.red);
    process.exit(1);
  });
