#!/usr/bin/env node

/**
 * Script to fix RIA profiles with "N" as their legal_name
 * Uses multiple fallback sources to find the best available name
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 50;
const LOG_FILE = path.join(__dirname, '..', 'logs', 'fix_n_legal_names.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'fix_n_legal_names_progress.json');

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logging utility
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Progress management
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    processed: 0,
    fixed: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
}

// Load raw ADV data for name lookups
function loadADVData() {
  log('📂 Loading raw ADV data...');
  
  // Check for the combined ADV file first
  const combinedPath = path.join(process.cwd(), 'output', 'intermediate', 'adv_base_combined.csv');
  if (fs.existsSync(combinedPath)) {
    log(`  Found combined ADV file: ${combinedPath}`);
    const content = fs.readFileSync(combinedPath, 'utf8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    
    const advLookup = new Map();
    for (const record of records) {
      const crdStr = record['1E1'];
      if (!crdStr) continue;
      
      const crd = parseInt(crdStr);
      if (isNaN(crd) || crd <= 0) continue;
      
      // Store all potential name fields
      advLookup.set(crd, {
        main_name: record['1A']?.trim() || null,
        legal_name: record['1C-Legal']?.trim() || null,
        business_name: record['1C-Business']?.trim() || null,
        new_name: record['1C-New Name']?.trim() || null,
        city: record['1F1-City']?.trim() || null,
        state: record['1F1-State']?.trim() || null,
      });
    }
    
    log(`  Loaded ${advLookup.size} ADV records`);
    return advLookup;
  }
  
  // If combined file doesn't exist, try to load from raw directories
  const rawDirs = fs.readdirSync(path.join(process.cwd(), 'raw'))
    .filter(dir => dir.includes('ADV_Filing_Data') || dir.includes('adv-filing-data'))
    .sort()
    .reverse(); // Most recent first
  
  if (rawDirs.length === 0) {
    log('  ⚠️ No ADV data files found');
    return new Map();
  }
  
  const advLookup = new Map();
  for (const dir of rawDirs.slice(0, 3)) { // Load only most recent 3 months
    const dirPath = path.join(process.cwd(), 'raw', dir);
    const baseFiles = fs.readdirSync(dirPath)
      .filter(file => file.includes('ADV_Base') && file.endsWith('.csv'));
    
    for (const file of baseFiles) {
      try {
        const filePath = path.join(dirPath, file);
        log(`  Loading ${file}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        const records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
          encoding: 'latin1'
        });
        
        for (const record of records) {
          const crdStr = record['1E1'];
          if (!crdStr) continue;
          
          const crd = parseInt(crdStr);
          if (isNaN(crd) || crd <= 0) continue;
          
          // Only add if not already present (newer data takes precedence)
          if (!advLookup.has(crd)) {
            advLookup.set(crd, {
              main_name: record['1A']?.trim() || null,
              legal_name: record['1C-Legal']?.trim() || null,
              business_name: record['1C-Business']?.trim() || null,
              new_name: record['1C-New Name']?.trim() || null,
              city: record['1F1-City']?.trim() || null,
              state: record['1F1-State']?.trim() || null,
            });
          }
        }
      } catch (error) {
        log(`  ⚠️ Error loading ${file}: ${error.message}`);
      }
    }
  }
  
  log(`  Total ADV records loaded: ${advLookup.size}`);
  return advLookup;
}

// Apply name prioritization logic
function selectBestName(crdNumber, advData, dbData) {
  // Priority order for selecting names
  const candidates = [];
  
  // From ADV data
  if (advData) {
    // New name takes highest priority if changed
    if (advData.new_name && advData.new_name !== 'N' && advData.new_name !== 'Y') {
      candidates.push({ name: advData.new_name, source: 'ADV new_name' });
    }
    
    // Business name (DBA) is often what clients know
    if (advData.business_name && advData.business_name !== 'N' && advData.business_name !== 'Y') {
      candidates.push({ name: advData.business_name, source: 'ADV business_name' });
    }
    
    // Legal name from ADV
    if (advData.legal_name && advData.legal_name !== 'N' && advData.legal_name !== 'Y') {
      candidates.push({ name: advData.legal_name, source: 'ADV legal_name' });
    }
    
    // Main name field (1A)
    if (advData.main_name && advData.main_name !== 'N' && advData.main_name !== 'Y') {
      candidates.push({ name: advData.main_name, source: 'ADV main_name' });
    }
  }
  
  // From existing database data
  if (dbData) {
    // Business name from database
    if (dbData.business_name && dbData.business_name !== 'N' && dbData.business_name !== 'Y') {
      candidates.push({ name: dbData.business_name, source: 'DB business_name' });
    }
    
    // Extract from narrative if available
    if (dbData.narrative_name) {
      candidates.push({ name: dbData.narrative_name, source: 'narrative extraction' });
    }
    
    // From control persons (company formed from founder's name)
    if (dbData.control_person_company) {
      candidates.push({ name: dbData.control_person_company, source: 'control_persons' });
    }
    
    // From private funds
    if (dbData.fund_company) {
      candidates.push({ name: dbData.fund_company, source: 'private_funds' });
    }
  }
  
  // Select the first valid candidate
  for (const candidate of candidates) {
    if (candidate.name && candidate.name.trim().length > 1) {
      return candidate;
    }
  }
  
  // Default fallback
  return {
    name: `Investment Adviser ${crdNumber}`,
    source: 'default fallback'
  };
}

// Get additional data from database for a CRD
async function getDBData(crdNumber) {
  const dbData = {};
  
  try {
    // Get current profile data
    const { data: profile } = await supabase
      .from('ria_profiles')
      .select('business_name')
      .eq('crd_number', crdNumber)
      .single();
    
    if (profile) {
      dbData.business_name = profile.business_name;
    }
    
    // Try to extract from narrative
    const { data: narrative } = await supabase
      .from('narratives')
      .select('narrative')
      .eq('crd_number', crdNumber)
      .single();
    
    if (narrative && narrative.narrative) {
      // Common patterns in narratives
      const patterns = [
        /^([^,]+) (?:is|operates as|provides)/i,
        /advisory narrative for ["']([^"']+)["']/i,
        /^([A-Z][^,]+(?:\s+[A-Z][^,]+)*) (?:manages|offers|specializes)/i
      ];
      
      for (const pattern of patterns) {
        const match = narrative.narrative.match(pattern);
        if (match && match[1]) {
          const extractedName = match[1].trim();
          // Validate it's not a generic phrase
          if (extractedName.length > 3 && !extractedName.toLowerCase().includes('investment adviser')) {
            dbData.narrative_name = extractedName;
            break;
          }
        }
      }
    }
    
    // Get control persons for potential company name
    const { data: controlPersons } = await supabase
      .from('control_persons')
      .select('person_name, title')
      .eq('crd_number', crdNumber)
      .limit(5);
    
    if (controlPersons && controlPersons.length > 0) {
      // Look for founder/CEO
      const keyPerson = controlPersons.find(cp =>
        cp.title && (
          cp.title.toUpperCase().includes('FOUNDER') ||
          cp.title.toUpperCase().includes('CEO') ||
          cp.title.toUpperCase().includes('PRESIDENT') ||
          cp.title.toUpperCase().includes('PRINCIPAL')
        )
      ) || controlPersons[0];
      
      if (keyPerson && keyPerson.person_name) {
        // Extract last name and create company name
        const nameParts = keyPerson.person_name.split(',');
        if (nameParts[0] && nameParts[0].length > 2) {
          const lastName = nameParts[0].trim();
          // Only use if it's a reasonable name
          if (lastName.length > 2 && lastName !== 'N' && lastName !== 'Y') {
            dbData.control_person_company = `${lastName} Investment Management`;
          }
        }
      }
    }
    
    // Get private funds for potential company name extraction
    const { data: funds } = await supabase
      .from('ria_private_funds')
      .select('fund_name')
      .eq('crd_number', crdNumber)
      .limit(3);
    
    if (funds && funds.length > 0) {
      for (const fund of funds) {
        if (fund.fund_name) {
          // Extract company name from fund name
          // Examples: "ABC Capital Fund I" -> "ABC Capital"
          const fundName = fund.fund_name;
          const patterns = [
            /^([^,]+?)\s+(?:Fund|LP|L\.P\.|Partners|Capital)/i,
            /^([A-Z][^,]+?)\s+[IVX]+$/i,
            /^([^,]+?)\s+(?:Series|Class)/i
          ];
          
          for (const pattern of patterns) {
            const match = fundName.match(pattern);
            if (match && match[1]) {
              const extractedName = match[1].trim();
              if (extractedName.length > 3) {
                dbData.fund_company = extractedName;
                break;
              }
            }
          }
          
          if (dbData.fund_company) break;
        }
      }
    }
    
  } catch (error) {
    log(`  ⚠️ Error fetching DB data for CRD ${crdNumber}: ${error.message}`);
  }
  
  return dbData;
}

// Main processing function
async function processRIAs(advLookup) {
  const progress = loadProgress();
  
  log('\n🔍 Finding RIA profiles with legal_name = "N"...');
  
  // Get all profiles with "N" as legal_name
  const { data: profiles, error, count } = await supabase
    .from('ria_profiles')
    .select('crd_number', { count: 'exact' })
    .eq('legal_name', 'N')
    .order('crd_number');
  
  if (error) {
    log(`❌ Error fetching profiles: ${error.message}`);
    return;
  }
  
  log(`📊 Found ${count} profiles with legal_name = "N"`);
  
  if (!profiles || profiles.length === 0) {
    log('✅ No profiles found with legal_name = "N"');
    return;
  }
  
  // Process in batches
  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, Math.min(i + BATCH_SIZE, profiles.length));
    log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} profiles)`);
    
    for (const profile of batch) {
      try {
        const crd = profile.crd_number;
        
        // Get ADV data
        const advData = advLookup.get(crd);
        
        // Get additional DB data
        const dbData = await getDBData(crd);
        
        // Select best name
        const bestName = selectBestName(crd, advData, dbData);
        
        // Update the profile
        const { error: updateError } = await supabase
          .from('ria_profiles')
          .update({ 
            legal_name: bestName.name,
            // Also update city/state if available from ADV
            ...(advData?.city && { city: advData.city }),
            ...(advData?.state && { state: advData.state })
          })
          .eq('crd_number', crd);
        
        if (updateError) {
          log(`  ❌ Failed to update CRD ${crd}: ${updateError.message}`);
          progress.failed++;
        } else {
          log(`  ✅ Updated CRD ${crd}: "${bestName.name}" (source: ${bestName.source})`);
          progress.fixed++;
        }
        
        progress.processed++;
        
      } catch (error) {
        log(`  ❌ Error processing CRD ${profile.crd_number}: ${error.message}`);
        progress.errors.push({
          crd: profile.crd_number,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        progress.failed++;
        progress.processed++;
      }
    }
    
    // Save progress after each batch
    saveProgress(progress);
    log(`  💾 Progress saved: ${progress.processed}/${profiles.length} processed, ${progress.fixed} fixed, ${progress.failed} failed`);
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return progress;
}

// Verify results
async function verifyResults() {
  log('\n🔍 Verifying results...');
  
  // Count remaining "N" entries
  const { count: remainingN } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('legal_name', 'N');
  
  log(`📊 Remaining profiles with legal_name = "N": ${remainingN}`);
  
  // Sample some fixed profiles
  const { data: samples } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name, business_name, city, state')
    .not('legal_name', 'eq', 'N')
    .limit(10)
    .order('crd_number');
  
  if (samples && samples.length > 0) {
    log('\n📋 Sample of fixed profiles:');
    samples.forEach(s => {
      log(`  CRD ${s.crd_number}: ${s.legal_name} (${s.city}, ${s.state})`);
    });
  }
  
  return remainingN;
}

// Main execution
async function main() {
  log('=' .repeat(60));
  log('🚀 Starting RIA Name Fix Process for "N" entries');
  log('=' .repeat(60));
  
  try {
    // Load ADV data
    const advLookup = loadADVData();
    
    // Process RIAs
    const finalProgress = await processRIAs(advLookup);
    
    // Verify results
    const remaining = await verifyResults();
    
    // Final summary
    log('\n' + '=' .repeat(60));
    log('📊 FINAL SUMMARY');
    log('=' .repeat(60));
    log(`✅ Processed: ${finalProgress.processed} profiles`);
    log(`✅ Fixed: ${finalProgress.fixed} profiles`);
    log(`❌ Failed: ${finalProgress.failed} profiles`);
    log(`⏭️ Skipped: ${finalProgress.skipped} profiles`);
    log(`📝 Remaining "N" entries: ${remaining}`);
    
    if (finalProgress.errors.length > 0) {
      log(`\n⚠️ Errors encountered: ${finalProgress.errors.length}`);
      log('See progress file for details');
    }
    
    log('\n✨ Process complete!');
    log(`📁 Logs saved to: ${LOG_FILE}`);
    log(`📁 Progress saved to: ${PROGRESS_FILE}`);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { loadADVData, selectBestName, getDBData };
