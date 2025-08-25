#!/usr/bin/env node
// Script to monitor the progress of all fix_ria_names.js processes

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const REFRESH_INTERVAL = 5000; // 5 seconds

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

// Function to check if process is running
const isProcessRunning = (processId) => {
  try {
    const logs = fs.readFileSync(path.join(LOGS_DIR, `fix_ria_names_${processId}.log`), 'utf8');
    const lastLine = logs.trim().split('\n').pop();
    return !lastLine.includes('RIA name fixing process complete');
  } catch (error) {
    return false;
  }
};

// Function to get process progress
const getProcessProgress = (processId) => {
  try {
    const progressFile = path.join(LOGS_DIR, `fix_ria_names_progress_${processId}.json`);
    
    if (fs.existsSync(progressFile)) {
      const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      return {
        processed: progress.processed || 0,
        updated: progress.updated || 0,
        failed: progress.failed || 0,
        lastProcessedCRD: progress.lastProcessedCRD || 0
      };
    }
    
    return { processed: 0, updated: 0, failed: 0, lastProcessedCRD: 0 };
  } catch (error) {
    console.error(`Error reading progress for ${processId}:`, error.message);
    return { processed: 0, updated: 0, failed: 0, lastProcessedCRD: 0 };
  }
};

// Function to get total progress across all processes
const getTotalProgress = () => {
  const processes = ['p1', 'p2', 'p3', 'p4'];
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  
  processes.forEach(processId => {
    const progress = getProcessProgress(processId);
    totalProcessed += progress.processed;
    totalUpdated += progress.updated;
    totalFailed += progress.failed;
  });
  
  return { totalProcessed, totalUpdated, totalFailed };
};

// Function to check the remaining undefined names
async function getRemainingUndefinedNames() {
  try {
    const { count, error } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true })
      .is('legal_name', null);
      
    if (error) {
      console.error('Error fetching count:', error.message);
      return -1;
    }
    
    return count;
  } catch (error) {
    console.error('Exception fetching count:', error.message);
    return -1;
  }
}

// Function to get the total number of RIAs
async function getTotalRIAs() {
  try {
    const { count, error } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      console.error('Error fetching total count:', error.message);
      return -1;
    }
    
    return count;
  } catch (error) {
    console.error('Exception fetching total count:', error.message);
    return -1;
  }
}

// Main function to monitor progress
async function monitorProgress() {
  console.clear();
  
  const processes = ['p1', 'p2', 'p3', 'p4'];
  const totalRIAs = await getTotalRIAs();
  const remainingUndefined = await getRemainingUndefinedNames();
  const fixedNames = totalRIAs - remainingUndefined;
  const percentageFixed = ((fixedNames / totalRIAs) * 100).toFixed(2);
  
  console.log('\n' + colors.bright + colors.fg.cyan + '======== RIA NAME FIXING PROGRESS MONITOR ========' + colors.reset + '\n');
  
  // Display overall progress
  console.log(colors.bright + 'Overall Progress:' + colors.reset);
  console.log(`${colors.fg.green}✓ Fixed Names:${colors.reset} ${fixedNames} / ${totalRIAs} (${percentageFixed}%)`);
  console.log(`${colors.fg.yellow}⚠ Undefined Names:${colors.reset} ${remainingUndefined} / ${totalRIAs} (${(100 - percentageFixed).toFixed(2)}%)`);
  
  const { totalProcessed, totalUpdated, totalFailed } = getTotalProgress();
  console.log(`${colors.fg.blue}ℹ Total Processed:${colors.reset} ${totalProcessed} (Updated: ${totalUpdated}, Failed: ${totalFailed})`);
  
  console.log('\n' + colors.bright + 'Process Status:' + colors.reset);
  
  // Display individual process status
  processes.forEach(processId => {
    const isRunning = isProcessRunning(processId);
    const progress = getProcessProgress(processId);
    const statusText = isRunning ? 
      colors.fg.green + '● RUNNING' + colors.reset : 
      colors.fg.red + '○ COMPLETED' + colors.reset;
      
    console.log(`${colors.bright}Process ${processId}:${colors.reset} ${statusText}`);
    console.log(`  Last CRD: ${progress.lastProcessedCRD}`);
    console.log(`  Processed: ${progress.processed} (Updated: ${progress.updated}, Failed: ${progress.failed})`);
  });
  
  console.log('\n' + colors.bright + colors.fg.cyan + '=================================================' + colors.reset + '\n');
  
  // Check if all processes are completed
  const allCompleted = processes.every(processId => !isProcessRunning(processId));
  
  if (allCompleted) {
    console.log(colors.bright + colors.fg.green + 'All processes have completed!' + colors.reset);
    console.log(`Total fixed names: ${fixedNames} / ${totalRIAs} (${percentageFixed}%)`);
    console.log(`Remaining undefined names: ${remainingUndefined}`);
    
    if (remainingUndefined > 0) {
      console.log(colors.fg.yellow + '\nThere are still undefined names. Consider running another batch to fix them.' + colors.reset);
    } else {
      console.log(colors.fg.green + '\nAll names have been successfully fixed! Ready to restart narrative generation.' + colors.reset);
    }
    
    return;
  }
  
  // Schedule the next update
  setTimeout(() => {
    monitorProgress();
  }, REFRESH_INTERVAL);
}

// Run the monitoring function
monitorProgress().catch(error => {
  console.error('Error in monitoring:', error);
});
