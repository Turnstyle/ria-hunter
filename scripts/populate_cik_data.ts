#!/usr/bin/env tsx
/**
 * Populate CIK data from SEC EDGAR files to fix CIK/CRD identifier mismatch
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface CikMapping {
  [crdNumber: string]: string; // CRD -> CIK
}

function loadCsvFile(filePath: string): any[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch (error) {
    console.error(`Error loading CSV file ${filePath}:`, error);
    return [];
  }
}

function processAdvDirectory(directoryPath: string): CikMapping {
  console.log(`Processing directory: ${directoryPath}`);
  
  const cikMappings: CikMapping = {};
  
  try {
    const files = readdirSync(directoryPath);
    
    // Find ADV base files and CIK files
    const baseFiles = files.filter(f => f.includes('_ADV_Base_') && f.endsWith('.csv'));
    const cikFiles = files.filter(f => f.includes('_1D3_CIK_') && f.endsWith('.csv'));
    
    if (baseFiles.length === 0) {
      console.warn(`No ADV base files found in ${directoryPath}`);
      return cikMappings;
    }
    
    if (cikFiles.length === 0) {
      console.warn(`No CIK files found in ${directoryPath}`);
      return cikMappings;
    }
    
    // Load CIK mappings (FilingID -> CIK)
    const filingToCik: { [filingId: string]: string } = {};
    
    for (const cikFile of cikFiles) {
      console.log(`Loading CIK file: ${cikFile}`);
      const cikPath = join(directoryPath, cikFile);
      const cikData = loadCsvFile(cikPath);
      
      for (const row of cikData) {
        if (row.FilingID && row.CIK) {
          const filingId = String(row.FilingID);
          const cik = String(row.CIK).padStart(10, '0'); // Pad CIK to 10 digits
          filingToCik[filingId] = cik;
        }
      }
    }
    
    console.log(`Loaded ${Object.keys(filingToCik).length} CIK mappings`);
    
    // Load ADV base files and join with CIK data
    for (const baseFile of baseFiles) {
      console.log(`Loading ADV base file: ${baseFile}`);
      const basePath = join(directoryPath, baseFile);
      const advData = loadCsvFile(basePath);
      
      for (const row of advData) {
        try {
          const filingId = String(row.FilingID);
          const crdNumber = row['1E1']; // CRD number column
          
          // Skip if no CRD number
          if (!crdNumber || crdNumber === '') {
            continue;
          }
          
          const crdNumberStr = String(Math.floor(parseFloat(crdNumber)));
          
          // Get CIK if available
          if (filingId in filingToCik) {
            const cik = filingToCik[filingId];
            // Store the mapping, using most recent filing if multiple exist
            cikMappings[crdNumberStr] = cik;
          }
        } catch (error) {
          // Skip problematic rows silently
          continue;
        }
      }
    }
    
    console.log(`Found ${Object.keys(cikMappings).length} CRD->CIK mappings in directory`);
    return cikMappings;
    
  } catch (error) {
    console.error(`Error processing directory ${directoryPath}:`, error);
    return cikMappings;
  }
}

async function updateDatabaseCikMappings(cikMappings: CikMapping): Promise<void> {
  console.log(`Updating database with ${Object.keys(cikMappings).length} CIK mappings`);
  
  try {
    let updateCount = 0;
    
    // Process in batches to avoid overwhelming the database
    const entries = Object.entries(cikMappings);
    const batchSize = 50;
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      for (const [crdNumber, cik] of batch) {
        try {
          const { error } = await supabaseAdmin
            .from('ria_profiles')
            .update({ cik })
            .eq('crd_number', parseInt(crdNumber))
            .is('cik', null);
          
          if (!error) {
            updateCount++;
          } else if (error.code !== 'PGRST116') { // Not "no rows returned" error
            console.warn(`Warning updating CRD ${crdNumber}: ${error.message}`);
          }
        } catch (error) {
          console.warn(`Error updating CRD ${crdNumber}:`, error);
          continue;
        }
      }
      
      // Small delay between batches
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Successfully updated ${updateCount} profiles with CIK data`);
    
    // Show sample results
    const { data: results, error } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, cik')
      .not('cik', 'is', null)
      .limit(10);
    
    if (results && results.length > 0) {
      console.log('Sample updated profiles:');
      for (const profile of results) {
        console.log(`  CRD ${profile.crd_number}: ${profile.legal_name} -> CIK ${profile.cik}`);
      }
    } else {
      console.log('No profiles with CIK data found in database');
    }
    
  } catch (error) {
    console.error('Database update error:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('Starting CIK data population process');
  
  // Find all ADV data directories
  const rawDir = 'raw';
  
  try {
    const rawContents = readdirSync(rawDir);
    const advDirectories = rawContents
      .map(name => join(rawDir, name))
      .filter(path => {
        try {
          return statSync(path).isDirectory() && path.includes('ADV_Filing_Data');
        } catch {
          return false;
        }
      })
      .sort(); // Process in chronological order
    
    console.log(`Found ${advDirectories.length} ADV data directories`);
    
    // Process all directories and collect CIK mappings
    const allCikMappings: CikMapping = {};
    
    for (const directory of advDirectories) {
      const directoryMappings = processAdvDirectory(directory);
      
      // Merge mappings (later filings take precedence)
      Object.assign(allCikMappings, directoryMappings);
    }
    
    console.log(`Total unique CRD->CIK mappings found: ${Object.keys(allCikMappings).length}`);
    
    // Update database
    if (Object.keys(allCikMappings).length > 0) {
      await updateDatabaseCikMappings(allCikMappings);
    } else {
      console.warn('No CIK mappings found to update');
    }
    
    console.log('CIK population process completed');
    
  } catch (error) {
    console.error('Process failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
