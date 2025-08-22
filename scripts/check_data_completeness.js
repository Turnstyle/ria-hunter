// Script to check data completeness and missing narratives
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDataCompleteness() {
  try {
    console.log('Analyzing raw data directories...');
    const rawDir = path.join(process.cwd(), 'raw');
    
    // Get list of directories in /raw
    let rawDirs;
    try {
      rawDirs = fs.readdirSync(rawDir)
        .filter(item => {
          const itemPath = path.join(rawDir, item);
          return fs.statSync(itemPath).isDirectory() && 
                 (item.includes('ADV_Filing_Data') || item.includes('adv-filing-data'));
        });
    } catch (e) {
      console.error('Error reading raw directory:', e);
      rawDirs = [];
    }
    
    console.log(`Found ${rawDirs.length} raw data directories`);
    
    // Function to count rows in a CSV file
    const countCsvRows = (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').length - 1; // Subtract header row
      } catch (e) {
        console.error(`Error reading file ${filePath}:`, e);
        return 0;
      }
    };
    
    const results = [];
    
    // For each directory, try to get counts from specific files
    for (const dir of rawDirs.slice(0, 3)) { // Limit to first 3 for speed
      const dirPath = path.join(rawDir, dir);
      
      const baseFileA = path.join(dirPath, 'IA_ADV_Base_A_' + dir.replace(/[^0-9]/g, '') + '.csv');
      const baseFileAExists = fs.existsSync(baseFileA);
      
      const baseFileB = path.join(dirPath, 'IA_ADV_Base_B_' + dir.replace(/[^0-9]/g, '') + '.csv');
      const baseFileBExists = fs.existsSync(baseFileB);
      
      const scheduleAB = path.join(dirPath, 'IA_Schedule_A_B_' + dir.replace(/[^0-9]/g, '') + '.csv');
      const scheduleABExists = fs.existsSync(scheduleAB);
      
      const scheduleD7B1 = path.join(dirPath, 'IA_Schedule_D_7B1_' + dir.replace(/[^0-9]/g, '') + '.csv');
      const scheduleD7B1Exists = fs.existsSync(scheduleD7B1);
      
      const rawRiaCount = (baseFileAExists ? countCsvRows(baseFileA) : 0) + 
                         (baseFileBExists ? countCsvRows(baseFileB) : 0);
      
      const rawControlPersonsCount = scheduleABExists ? countCsvRows(scheduleAB) : 0;
      const rawPrivateFundsCount = scheduleD7B1Exists ? countCsvRows(scheduleD7B1) : 0;
      
      results.push({
        month: dir,
        rawRiaCount,
        rawControlPersonsCount,
        rawPrivateFundsCount
      });
    }
    
    console.log('\nRaw data counts by month:');
    for (const result of results) {
      console.log(`${result.month}:`);
      console.log(`  - RIAs: ${result.rawRiaCount}`);
      console.log(`  - Control Persons: ${result.rawControlPersonsCount}`);
      console.log(`  - Private Funds: ${result.rawPrivateFundsCount}`);
    }
    
    // Check for missing narratives
    console.log('\nChecking for missing narratives...');
    
    // Get total count of profiles without narratives
    const { data: missingData, error: missingError } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .not('crd_number', 'in', supabase.from('narratives').select('crd_number'))
      .limit(100); // Limit to 100 for performance
    
    if (missingError) {
      console.error('Error checking missing narratives:', missingError);
    } else {
      console.log(`Found ${missingData.length} profiles (of 100 checked) without narratives`);
      if (missingData.length > 0) {
        console.log('Sample CRD numbers without narratives:');
        missingData.slice(0, 10).forEach(row => console.log(`  - ${row.crd_number}`));
      }
    }
    
    // Try to get total count of profiles without narratives
    try {
      const { count, error } = await supabase
        .from('ria_profiles')
        .select('crd_number', { count: 'exact', head: true })
        .not('crd_number', 'in', supabase.from('narratives').select('crd_number'));
      
      if (error) {
        console.error('Error counting missing narratives:', error);
      } else {
        console.log(`Total profiles without narratives: ${count} (${((count/103620)*100).toFixed(2)}% of total)`);
      }
    } catch (e) {
      console.error('Error counting missing narratives:', e);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDataCompleteness();
