// Script to analyze raw data files and compare with database counts
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to count rows in a CSV file
function countCsvRows(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return 0;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    // Skip header row
    return content.split('\n').length - 1;
  } catch (e) {
    console.error(`Error reading file ${filePath}:`, e);
    return 0;
  }
}

// Function to parse a CSV file
function parseCSV(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch (e) {
    console.error(`Error parsing file ${filePath}:`, e);
    return [];
  }
}

async function analyzeRawData() {
  try {
    console.log('Analyzing raw data vs. processed data...');
    
    // Get list of raw data directories
    const rawDir = path.join(process.cwd(), 'raw');
    const rawDirs = fs.readdirSync(rawDir)
      .filter(item => {
        const itemPath = path.join(rawDir, item);
        return fs.statSync(itemPath).isDirectory() && 
               (item.toLowerCase().includes('adv_filing_data') || 
                item.toLowerCase().includes('adv-filing-data'));
      })
      .sort();
    
    console.log(`Found ${rawDirs.length} raw data directories`);
    
    // Analyze each directory
    const results = [];
    
    for (const dir of rawDirs) {
      const dirPath = path.join(rawDir, dir);
      console.log(`\nAnalyzing ${dir}...`);
      
      // Determine file paths with flexible naming
      const basePaths = fs.readdirSync(dirPath)
        .filter(file => file.toLowerCase().includes('adv_base') || file.toLowerCase().includes('base_a'));
      
      const schedulePaths = fs.readdirSync(dirPath)
        .filter(file => file.toLowerCase().includes('schedule_a_b'));
      
      const fundPaths = fs.readdirSync(dirPath)
        .filter(file => file.toLowerCase().includes('schedule_d_7b1'));
      
      // Count rows
      let riaCount = 0;
      for (const file of basePaths) {
        riaCount += countCsvRows(path.join(dirPath, file));
      }
      
      let controlPersonCount = 0;
      for (const file of schedulePaths) {
        controlPersonCount += countCsvRows(path.join(dirPath, file));
      }
      
      let fundCount = 0;
      for (const file of fundPaths) {
        fundCount += countCsvRows(path.join(dirPath, file));
      }
      
      console.log(`- RIAs: ${riaCount}`);
      console.log(`- Control persons: ${controlPersonCount}`);
      console.log(`- Private funds: ${fundCount}`);
      
      // Extract month/year from directory name
      const dateMatch = dir.match(/\\d{8}|\\d{6}/);
      const monthYear = dateMatch ? dateMatch[0] : dir;
      
      results.push({
        directory: dir,
        monthYear,
        rawRiaCount: riaCount,
        rawControlPersonCount: controlPersonCount,
        rawFundCount: fundCount
      });
    }
    
    // Compare with database
    console.log('\nComparing with database...');
    
    // Get total counts from database
    const { count: dbRiaCount, error: riaError } = await supabase
      .from('ria_profiles')
      .select('*', { count: 'exact', head: true });
      
    if (riaError) {
      console.error('Error counting RIA profiles:', riaError);
    }
    
    const { count: dbControlCount, error: controlError } = await supabase
      .from('control_persons')
      .select('*', { count: 'exact', head: true });
      
    if (controlError) {
      console.error('Error counting control persons:', controlError);
    }
    
    const { count: dbFundCount, error: fundError } = await supabase
      .from('ria_private_funds')
      .select('*', { count: 'exact', head: true });
      
    if (fundError) {
      console.error('Error counting private funds:', fundError);
    }
    
    console.log('\nRaw vs. Database Summary:');
    
    // Calculate totals from raw files
    const totalRawRias = results.reduce((sum, r) => sum + r.rawRiaCount, 0);
    const totalRawControl = results.reduce((sum, r) => sum + r.rawControlPersonCount, 0);
    const totalRawFunds = results.reduce((sum, r) => sum + r.rawFundCount, 0);
    
    console.log(`- RIAs: ${totalRawRias} (raw) vs ${dbRiaCount} (db) - ${((dbRiaCount / totalRawRias) * 100).toFixed(2)}% processed`);
    console.log(`- Control persons: ${totalRawControl} (raw) vs ${dbControlCount} (db) - ${((dbControlCount / totalRawControl) * 100).toFixed(2)}% processed`);
    console.log(`- Private funds: ${totalRawFunds} (raw) vs ${dbFundCount} (db) - ${((dbFundCount / totalRawFunds) * 100).toFixed(2)}% processed`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

analyzeRawData();
