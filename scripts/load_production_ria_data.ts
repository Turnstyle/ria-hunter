#!/usr/bin/env tsx
/**
 * Load real RIA profiles from SEC ADV filing data
 * This replaces synthetic data with actual RIA information from SEC filings
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface RIAProfile {
  crd_number: number;
  legal_name: string;
  business_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  fax?: string;
  website?: string;
  aum?: number;
  form_adv_date?: string;
  filing_id?: string;
}

interface ProcessingStats {
  totalProcessed: number;
  validProfiles: number;
  duplicates: number;
  inserted: number;
  errors: number;
}

function loadCsvFile(filePath: string): any[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true // Handle inconsistent column counts
    });
  } catch (error) {
    console.error(`Error loading CSV file ${filePath}:`, error);
    return [];
  }
}

function parseAUM(aumStr: string | undefined): number | null {
  if (!aumStr || aumStr === '') return null;
  
  // Remove commas and convert to number
  const cleaned = aumStr.replace(/[,$]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  try {
    // Handle various date formats from SEC data
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch {
    return null;
  }
}

function processAdvBaseFile(filePath: string): RIAProfile[] {
  console.log(`Processing ADV file: ${filePath}`);
  
  const profiles: RIAProfile[] = [];
  const data = loadCsvFile(filePath);
  
  for (const row of data) {
    try {
      // Extract core fields
      const crdNumber = parseInt(row['1E1']);
      const legalName = row['1C-Legal']?.trim();
      
      // Skip if no CRD number or legal name
      if (!crdNumber || !legalName || crdNumber <= 0) {
        continue;
      }
      
      // Build address
      const address = [row['1F1-Street 1'], row['1F1-Street 2']]
        .filter(Boolean)
        .join(', ')
        .trim();
      
      // Extract AUM from various possible columns (5F columns contain financial data)
      let aum = parseAUM(row['5F2c']) || parseAUM(row['5F2a']) || parseAUM(row['5F2b']);
      
      // Clean phone number
      let phone = row['1F3']?.replace(/[^\d\-\(\)\s\+\.]/g, '')?.trim();
      if (phone && phone.length < 7) phone = null;
      
      // Clean website
      let website = row['1F5']?.trim();
      if (website && !website.startsWith('http')) {
        website = `https://${website}`;
      }
      
      const profile: RIAProfile = {
        crd_number: crdNumber,
        legal_name: legalName,
        business_name: row['1C-Business']?.trim() || null,
        address: address || null,
        city: row['1F1-City']?.trim() || null,
        state: row['1F1-State']?.trim() || null,
        zip_code: row['1F1-Postal']?.trim() || null,
        phone: phone || null,
        fax: row['1J-Fax']?.trim() || null,
        website: website || null,
        aum: aum,
        form_adv_date: formatDate(row['DateSubmitted']),
        filing_id: row['FilingID']?.toString() || null
      };
      
      profiles.push(profile);
      
    } catch (error) {
      // Skip problematic rows silently
      continue;
    }
  }
  
  console.log(`  Extracted ${profiles.length} valid profiles from ${data.length} rows`);
  return profiles;
}

async function clearExistingData(): Promise<void> {
  console.log('Clearing existing synthetic data...');
  
  try {
    // Clear synthetic profiles (CRD numbers 999001-999019)
    const { error } = await supabaseAdmin
      .from('ria_profiles')
      .delete()
      .gte('crd_number', 999001)
      .lte('crd_number', 999019);
      
    if (error) {
      console.warn('Warning clearing synthetic data:', error.message);
    }
    
    // Clear any other test data
    await supabaseAdmin
      .from('ria_profiles')
      .delete()
      .like('legal_name', '%TEST%');
      
  } catch (error) {
    console.warn('Warning during data clearing:', error);
  }
}

async function insertProfiles(profiles: RIAProfile[]): Promise<ProcessingStats> {
  const stats: ProcessingStats = {
    totalProcessed: 0,
    validProfiles: 0,
    duplicates: 0,
    inserted: 0,
    errors: 0
  };
  
  // Remove duplicates (keep latest by filing_id)
  const uniqueProfiles = new Map<number, RIAProfile>();
  
  for (const profile of profiles) {
    const existing = uniqueProfiles.get(profile.crd_number);
    if (!existing || (profile.filing_id && profile.filing_id > (existing.filing_id || '0'))) {
      uniqueProfiles.set(profile.crd_number, profile);
    } else {
      stats.duplicates++;
    }
  }
  
  stats.totalProcessed = profiles.length;
  stats.validProfiles = uniqueProfiles.size;
  
  console.log(`Inserting ${stats.validProfiles} unique profiles (removed ${stats.duplicates} duplicates)...`);
  
  // Insert in batches
  const batchSize = 100;
  const profilesArray = Array.from(uniqueProfiles.values());
  
  for (let i = 0; i < profilesArray.length; i += batchSize) {
    const batch = profilesArray.slice(i, i + batchSize);
    
    try {
      const { error } = await supabaseAdmin
        .from('ria_profiles')
        .insert(batch.map(p => ({
          crd_number: p.crd_number,
          legal_name: p.legal_name,
          city: p.city,
          state: p.state,
          aum: p.aum,
          form_adv_date: p.form_adv_date
        })));
      
      if (error) {
        console.error(`Batch insert error:`, error);
        stats.errors += batch.length;
      } else {
        stats.inserted += batch.length;
        console.log(`  Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(profilesArray.length/batchSize)} (${stats.inserted}/${stats.validProfiles})`);
      }
      
      // Small delay between batches
      if (i + batchSize < profilesArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Error inserting batch:`, error);
      stats.errors += batch.length;
    }
  }
  
  return stats;
}

async function loadAllAdvDirectories(): Promise<RIAProfile[]> {
  const rawDir = 'raw';
  const allProfiles: RIAProfile[] = [];
  
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
      .sort(); // Process chronologically
    
    console.log(`Found ${advDirectories.length} ADV data directories`);
    
    for (const directory of advDirectories) {
      console.log(`\nProcessing directory: ${directory}`);
      
      try {
        const files = readdirSync(directory);
        const baseFiles = files.filter(f => f.includes('_ADV_Base_') && f.endsWith('.csv'));
        
        console.log(`  Found ${baseFiles.length} ADV base files`);
        
        for (const file of baseFiles) {
          const filePath = join(directory, file);
          const profiles = processAdvBaseFile(filePath);
          allProfiles.push(...profiles);
        }
        
      } catch (error) {
        console.error(`Error processing directory ${directory}:`, error);
        continue;
      }
    }
    
  } catch (error) {
    console.error('Error loading ADV directories:', error);
    throw error;
  }
  
  return allProfiles;
}

async function verifyData(): Promise<void> {
  console.log('\nVerifying loaded data...');
  
  try {
    // Get summary statistics
    const { data: stats } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum');
    
    if (!stats) {
      console.log('No data found in database');
      return;
    }
    
    console.log(`Total RIA profiles loaded: ${stats.length}`);
    
    // Show sample profiles
    const samples = stats.slice(0, 5);
    console.log('\nSample profiles:');
    for (const profile of samples) {
      console.log(`  CRD ${profile.crd_number}: ${profile.legal_name} (${profile.city}, ${profile.state}) - AUM: ${profile.aum || 'N/A'}`);
    }
    
    // Show state distribution
    const stateCount = stats.reduce((acc, p) => {
      const state = p.state || 'Unknown';
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topStates = Object.entries(stateCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('\nTop 10 states by RIA count:');
    for (const [state, count] of topStates) {
      console.log(`  ${state}: ${count}`);
    }
    
  } catch (error) {
    console.error('Error verifying data:', error);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Loading real RIA profiles from SEC ADV data...\n');
  
  try {
    // Step 1: Clear existing synthetic data
    await clearExistingData();
    
    // Step 2: Load all ADV profiles
    console.log('Loading ADV data from all directories...');
    const allProfiles = await loadAllAdvDirectories();
    
    if (allProfiles.length === 0) {
      console.log('❌ No profiles found in ADV data');
      return;
    }
    
    console.log(`\n📊 Processing Summary:`);
    console.log(`  Total profiles found: ${allProfiles.length}`);
    
    // Step 3: Insert into database
    const stats = await insertProfiles(allProfiles);
    
    console.log(`\n✅ Loading Complete!`);
    console.log(`  Total processed: ${stats.totalProcessed}`);
    console.log(`  Valid profiles: ${stats.validProfiles}`);
    console.log(`  Duplicates removed: ${stats.duplicates}`);
    console.log(`  Successfully inserted: ${stats.inserted}`);
    console.log(`  Errors: ${stats.errors}`);
    
    // Step 4: Verify the data
    await verifyData();
    
    console.log('\n🎉 Real RIA production data loaded successfully!');
    console.log('Ready to run CIK population script next.');
    
  } catch (error) {
    console.error('❌ Failed to load production data:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
