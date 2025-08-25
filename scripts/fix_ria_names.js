// Script to fix undefined RIA names in the database
// Pulls from various name fields in the raw data with a specified priority order

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 100;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'fix_ria_names.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'fix_ria_names_progress.json');

// Create logs directory if it doesn't exist
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

// Setup logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
};

// Save progress
const saveProgress = (data) => {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
};

// Load progress
const loadProgress = () => {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    processed: 0,
    updated: 0,
    failed: 0,
    lastProcessedCRD: 0,
    errors: []
  };
};

// Get narrative for the RIA
async function getNarrativeForRIA(crdNumber) {
  try {
    // First check if there is a narrative
    const { data: narrativeData, error: narrativeError } = await supabase
      .from('narratives')
      .select('narrative')
      .eq('crd_number', crdNumber)
      .limit(1);
      
    if (narrativeError) {
      log(`Error fetching narrative for CRD ${crdNumber}: ${narrativeError.message}`);
    }
    
    if (narrativeData && narrativeData.length > 0 && narrativeData[0].narrative) {
      // Extract firm name from narrative - usually in the first sentence
      const narrativeText = narrativeData[0].narrative;
      const match = narrativeText.match(/(?:narrative for|analysis of|advisory narrative for) ["']([^"']+)["']/i);
      
      if (match && match[1]) {
        return {
          source: 'narrative',
          name: match[1].trim()
        };
      }
    }
    
    // Check control persons data for potential names
    const { data: controlData, error: controlError } = await supabase
      .from('control_persons')
      .select('person_name, title')
      .eq('crd_number', crdNumber)
      .limit(10);
      
    if (controlError) {
      log(`Error fetching control persons for CRD ${crdNumber}: ${controlError.message}`);
    }
    
    if (controlData && controlData.length > 0) {
      // Find the founder or CEO from the control persons
      const importantPerson = controlData.find(cp => 
        cp.title && 
        (cp.title.toUpperCase().includes('FOUNDER') || 
         cp.title.toUpperCase().includes('CEO') || 
         cp.title.toUpperCase().includes('PRESIDENT'))
      );
      
      if (importantPerson && importantPerson.person_name) {
        // Extract company name from person name - often in the format "LASTNAME, FIRSTNAME, MIDDLENAME"
        const companyName = `${importantPerson.person_name.split(',')[0]} ADVISERS`;
        return {
          source: 'control_persons',
          name: companyName
        };
      }
      
      // Alternatively, just use the first person's name as a basis for the firm name
      if (controlData[0].person_name) {
        const lastName = controlData[0].person_name.split(',')[0];
        const companyName = `${lastName} ADVISERS`;
        return {
          source: 'control_persons',
          name: companyName
        };
      }
    }
    
    // Check private funds data
    const { data: fundsData, error: fundsError } = await supabase
      .from('ria_private_funds')
      .select('fund_name')
      .eq('crd_number', crdNumber)
      .limit(10);
      
    if (fundsError) {
      log(`Error fetching private funds for CRD ${crdNumber}: ${fundsError.message}`);
    }
    
    if (fundsData && fundsData.length > 0) {
      // Extract adviser name from fund names if possible
      for (const fund of fundsData) {
        if (fund.fund_name) {
          // Many fund names follow patterns like "XYZ Capital Partners Fund I"
          // Try to extract the adviser name portion
          const nameParts = fund.fund_name.split(' ');
          if (nameParts.length >= 2) {
            // Take first two parts of fund name as company name
            const companyName = nameParts.slice(0, 2).join(' ');
            return {
              source: 'ria_private_funds',
              name: companyName
            };
          } else {
            return {
              source: 'ria_private_funds',
              name: fund.fund_name
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    log(`Exception fetching data for CRD ${crdNumber}: ${error.message}`);
    return null;
  }
}

// Get RIAs with undefined names
async function getRIAsWithUndefinedNames(lastProcessedCRD, limit) {
  try {
    const { data: rias, error } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .is('legal_name', null)
      .gt('crd_number', lastProcessedCRD)
      .order('crd_number', { ascending: true })
      .limit(limit);
      
    if (error) {
      log(`Error fetching RIAs with undefined names: ${error.message}`);
      return [];
    }
    
    return rias;
  } catch (error) {
    log(`Exception fetching RIAs with undefined names: ${error.message}`);
    return [];
  }
}

// Fix RIA name using alternative data sources
async function fixRIAName(crdNumber) {
  try {
    // First get the current RIA profile
    const { data: ria, error: riaError } = await supabase
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', crdNumber)
      .limit(1);
      
    if (riaError || !ria || ria.length === 0) {
      log(`Error fetching RIA profile for CRD ${crdNumber}: ${riaError?.message || 'Not found'}`);
      return false;
    }
    
    // Get name from alternative sources
    const nameData = await getNarrativeForRIA(crdNumber);
    
    if (!nameData) {
      log(`No alternative name data available for CRD ${crdNumber}`);
      const defaultName = `Investment Adviser (CRD #${crdNumber})`;
      
      // Update with default name
      const { data, error } = await supabase
        .from('ria_profiles')
        .update({ legal_name: defaultName })
        .eq('crd_number', crdNumber);
        
      if (error) {
        log(`Error updating with default name for CRD ${crdNumber}: ${error.message}`);
        return false;
      }
      
      log(`⚠️ Updated with default name for CRD #${crdNumber}: "${defaultName}"`);
      return true;
    }
    
    // Update the RIA profile with the found name
    const { data, error } = await supabase
      .from('ria_profiles')
      .update({ legal_name: nameData.name })
      .eq('crd_number', crdNumber);
      
    if (error) {
      log(`Error updating name for CRD ${crdNumber}: ${error.message}`);
      return false;
    }
    
    log(`✅ Successfully updated name for CRD #${crdNumber} to "${nameData.name}" (source: ${nameData.source})`);
    return true;
  } catch (error) {
    log(`Exception fixing name for CRD ${crdNumber}: ${error.message}`);
    return false;
  }
}

// Process a batch of RIAs
async function processBatch(rias) {
  const results = [];
  
  for (const ria of rias) {
    const success = await fixRIAName(ria.crd_number);
    results.push({
      crd: ria.crd_number,
      success
    });
  }
  
  return results;
}

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    minCRD: 0,
    maxCRD: Number.MAX_SAFE_INTEGER,
    processId: 'default'
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-crd' && i + 1 < args.length) {
      result.minCRD = parseInt(args[i + 1], 10);
    } else if (args[i] === '--max-crd' && i + 1 < args.length) {
      result.maxCRD = parseInt(args[i + 1], 10);
    } else if (args[i] === '--process-id' && i + 1 < args.length) {
      result.processId = args[i + 1];
    }
  }
  
  return result;
};

// Main function
async function main() {
  const args = parseArgs();
  const processId = args.processId;
  
  // Use process-specific progress file
  const PROCESS_PROGRESS_FILE = path.join(__dirname, '..', 'logs', `fix_ria_names_progress_${processId}.json`);
  
  // Custom save/load for this process
  const saveProcessProgress = (data) => {
    fs.writeFileSync(PROCESS_PROGRESS_FILE, JSON.stringify(data, null, 2));
  };
  
  const loadProcessProgress = () => {
    if (fs.existsSync(PROCESS_PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESS_PROGRESS_FILE, 'utf8'));
    }
    return {
      processed: 0,
      updated: 0,
      failed: 0,
      lastProcessedCRD: args.minCRD,
      errors: []
    };
  };
  
  let progress = loadProcessProgress();
  log(`[Process ${processId}] Starting RIA name fixing process from CRD #${progress.lastProcessedCRD} (Range: ${args.minCRD}-${args.maxCRD})`);
  log(`[Process ${processId}] Progress so far: Processed ${progress.processed}, Updated ${progress.updated}, Failed ${progress.failed}`);
  
  let running = true;
  let emptyBatchCount = 0;
  
  while (running) {
    try {
      // Get batch of RIAs with undefined names within the specified range
      const { data: rias, error } = await supabase
        .from('ria_profiles')
        .select('crd_number')
        .is('legal_name', null)
        .gt('crd_number', progress.lastProcessedCRD)
        .lte('crd_number', args.maxCRD)
        .order('crd_number', { ascending: true })
        .limit(BATCH_SIZE);
        
      if (error) {
        log(`[Process ${processId}] Error fetching RIAs with undefined names: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        continue;
      }
      
      const batch = rias || [];
      
      if (batch.length === 0) {
        emptyBatchCount++;
        log(`[Process ${processId}] No more RIAs found with undefined names (empty batch #${emptyBatchCount})`);
        
        if (emptyBatchCount >= 3) {
          log(`[Process ${processId}] Reached end of RIAs with undefined names in range ${args.minCRD}-${args.maxCRD}`);
          running = false;
          break;
        }
        
        // Skip ahead by 1000 CRDs to find more, but stay within range
        progress.lastProcessedCRD = Math.min(progress.lastProcessedCRD + 1000, args.maxCRD);
        saveProcessProgress(progress);
        log(`[Process ${processId}] Skipping ahead to CRD #${progress.lastProcessedCRD}`);
        continue;
      }
      
      emptyBatchCount = 0;
      log(`[Process ${processId}] Processing batch of ${batch.length} RIAs`);
      
      // Process batch
      const results = await processBatch(batch);
      
      // Update progress
      const updated = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      progress.processed += batch.length;
      progress.updated += updated;
      progress.failed += failed;
      progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
      
      // Save progress
      saveProcessProgress(progress);
      
      // Also update global progress file
      try {
        const globalProgress = loadProgress();
        globalProgress.processed += batch.length;
        globalProgress.updated += updated;
        globalProgress.failed += failed;
        saveProgress(globalProgress);
      } catch (e) {
        log(`[Process ${processId}] Error updating global progress: ${e.message}`);
      }
      
      log(`[Process ${processId}] Batch completed: ${updated} updated, ${failed} failed`);
      log(`[Process ${processId}] Total process progress: ${progress.processed} processed, ${progress.updated} updated, ${progress.failed} failed`);
    } catch (error) {
      log(`[Process ${processId}] Error in main loop: ${error.message}`);
      
      progress.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message
      });
      saveProcessProgress(progress);
    }
  }
  
  log(`[Process ${processId}] RIA name fixing process complete for range ${args.minCRD}-${args.maxCRD}`);
  log(`[Process ${processId}] Final progress: ${progress.processed} processed, ${progress.updated} updated, ${progress.failed} failed`);
}

// Run the main function
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
