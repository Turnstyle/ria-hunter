require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const MAX_CONCURRENT_PROCESSES = 4;
const RESTART_DELAY_MS = 5000; // 5 seconds between restarts
const BATCH_SIZE = 200;
const TOTAL_RIAS = 103620;
const LOGS_DIR = path.join(__dirname, '../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Process definitions
const processes = [
  {
    name: 'control_persons',
    script: 'document_ai_control_persons.js',
    instances: 3,
    batchSize: BATCH_SIZE,
    batchRanges: [], // Will be populated dynamically
    env: process.env
  },
  {
    name: 'private_funds',
    script: 'document_ai_private_funds.js',
    instances: 3,
    batchSize: BATCH_SIZE,
    batchRanges: [], // Will be populated dynamically
    env: process.env
  }
];

// Calculate batch ranges for each process
processes.forEach(process => {
  const segmentSize = Math.floor(TOTAL_RIAS / process.instances);
  for (let i = 0; i < process.instances; i++) {
    const startFrom = i * segmentSize;
    process.batchRanges.push({ startFrom, batchSize: process.batchSize });
  }
});

// Run and monitor a single process
function runProcess(processConfig, rangeIndex) {
  const { name, script, batchRanges, env } = processConfig;
  const { startFrom, batchSize } = batchRanges[rangeIndex];
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const logFile = path.join(LOGS_DIR, `${name}_${startFrom}_${timestamp}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  
  console.log(`Starting ${name} process from ${startFrom} with batch size ${batchSize}`);
  
  // Build arguments
  const args = [
    path.join(__dirname, script),
    `--batch-size=${batchSize}`,
    `--start-from=${startFrom}`,
    '--continuous-mode=true' // Added flag to indicate continuous operation
  ];
  
  // Spawn the process
  const childProcess = spawn('node', args, { 
    env: env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Handle output
  childProcess.stdout.pipe(logStream);
  childProcess.stderr.pipe(logStream);
  
  // Log process start
  logStream.write(`\n[${new Date().toISOString()}] Starting ${name} process from ${startFrom} with batch size ${batchSize}\n`);
  
  // Handle process completion or failure
  childProcess.on('close', (code) => {
    logStream.write(`\n[${new Date().toISOString()}] Process exited with code ${code}\n`);
    logStream.end();
    
    console.log(`${name} process from ${startFrom} exited with code ${code}. Restarting in ${RESTART_DELAY_MS/1000} seconds...`);
    
    // Calculate new starting position by advancing
    const newStartFrom = (startFrom + batchSize * 10) % TOTAL_RIAS;
    processConfig.batchRanges[rangeIndex].startFrom = newStartFrom;
    
    // Restart the process after a delay
    setTimeout(() => {
      runProcess(processConfig, rangeIndex);
    }, RESTART_DELAY_MS);
  });
  
  return childProcess;
}

// Start all processes
console.log('Starting continuous ETL processes...');
processes.forEach(processConfig => {
  for (let i = 0; i < processConfig.batchRanges.length; i++) {
    runProcess(processConfig, i);
  }
});

console.log(`${processes.reduce((total, p) => total + p.instances, 0)} processes started and will run continuously.`);
console.log('Press Ctrl+C to terminate all processes.');

// Handle script termination
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

// Keep the script running
setInterval(() => {}, 60000);
