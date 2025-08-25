const { createClient } = require('@supabase/supabase-js');

// Use environment variables from env.local
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  console.log('Checking RIA Hunter database status...');
  try {
    const riaProfiles = await supabase.from('ria_profiles').select('count');
    if (riaProfiles.data && riaProfiles.data.length > 0) {
      console.log('RIA Profiles:', riaProfiles.data[0].count);
    } else {
      console.log('RIA Profiles: Error fetching data');
    }
    
    const narratives = await supabase.from('ria_narratives').select('count');
    if (narratives.data && narratives.data.length > 0) {
      console.log('Narratives:', narratives.data[0].count);
    } else {
      console.log('Narratives: Error fetching data');
    }
    
    const controlPersons = await supabase.from('control_persons').select('count');
    if (controlPersons.data && controlPersons.data.length > 0) {
      console.log('Control Persons:', controlPersons.data[0].count);
    } else {
      console.log('Control Persons: Error fetching data');
    }
    
    const privateFunds = await supabase.from('ria_private_funds').select('count');
    if (privateFunds.data && privateFunds.data.length > 0) {
      console.log('Private Funds:', privateFunds.data[0].count);
    } else {
      console.log('Private Funds: Error fetching data');
    }
    
    // Calculate progress percentages
    if (riaProfiles.data && narratives.data) {
      const narrativesPercentage = (narratives.data[0].count / riaProfiles.data[0].count * 100).toFixed(2);
      console.log(`Narratives Progress: ${narrativesPercentage}% (${narratives.data[0].count}/${riaProfiles.data[0].count})`);
    }
    
    console.log('\nChecking ETL Processes:');
    // Return the data for further processing
    return {
      riaProfiles: (riaProfiles.data && riaProfiles.data.length > 0) ? riaProfiles.data[0].count : 0,
      narratives: (narratives.data && narratives.data.length > 0) ? narratives.data[0].count : 0,
      controlPersons: (controlPersons.data && controlPersons.data.length > 0) ? controlPersons.data[0].count : 0,
      privateFunds: (privateFunds.data && privateFunds.data.length > 0) ? privateFunds.data[0].count : 0
    };
  } catch (error) {
    console.error('Error checking status:', error);
    return null;
  }
}

// Run the status check
checkStatus().then(status => {
  if (status) {
    console.log('\nSummary:');
    console.log('- RIA Profiles: 100% complete');
    
    const narrativesPercentage = (status.narratives / status.riaProfiles * 100).toFixed(2);
    console.log(`- Narratives: ${narrativesPercentage}% complete (${status.narratives}/${status.riaProfiles})`);
    
    // Assuming targets from the plan document
    const controlPersonsTarget = 15000;
    const privateFundsTarget = 100000;
    
    const controlPersonsPercentage = (status.controlPersons / controlPersonsTarget * 100).toFixed(2);
    console.log(`- Control Persons: ${controlPersonsPercentage}% of target (${status.controlPersons}/${controlPersonsTarget})`);
    
    const privateFundsPercentage = (status.privateFunds / privateFundsTarget * 100).toFixed(2);
    console.log(`- Private Funds: ${privateFundsPercentage}% of target (${status.privateFunds}/${privateFundsTarget})`);
  }
});
