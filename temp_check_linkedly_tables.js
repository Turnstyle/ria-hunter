// Check what RIA tables exist in the wrong Linkedly project
const { createClient } = require('@supabase/supabase-js');

// Wrong project credentials from the migration plan
const sourceUrl = "https://aqngxprpznclhtsmibsi.supabase.co";
const sourceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbmd4cHJwem5jbGh0c21pYnNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYyMzMxNSwiZXhwIjoyMDY4MTk5MzE1fQ.9IFI8bycr2XtR7gcSPSyxarZSnXe7JCXz3h6-u5VNDU";

console.log(`Connecting to Linkedly project: ${sourceUrl}`);

const supabase = createClient(sourceUrl, sourceKey);

async function checkLinkedlyTables() {
  const riaTableNames = [
    'ria_profiles', 
    'narratives', 
    'control_persons', 
    'ria_private_funds', 
    'ria_fund_marketers'
  ];

  console.log('Checking for RIA tables in Linkedly project:');
  console.log('='.repeat(50));
  
  for (const tableName of riaTableNames) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        if (error.message.includes('does not exist')) {
          console.log(`❌ ${tableName}: Table does not exist`);
        } else {
          console.log(`⚠️  ${tableName}: Error - ${error.message}`);
        }
      } else {
        console.log(`✅ ${tableName}: Table exists with ${data?.length || 0} sample records`);
        
        // If the table exists and has data, get the actual count
        if (data?.length || data?.length === 0) {
          try {
            const { count } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true });
            console.log(`   📊 Total records: ${count || 0}`);
          } catch (countErr) {
            console.log(`   📊 Could not get count: ${countErr.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`💥 ${tableName}: Connection error - ${err.message}`);
    }
  }
  
  console.log('='.repeat(50));
  console.log('Linkedly project scan complete');
}

checkLinkedlyTables();
