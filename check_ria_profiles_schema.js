// Check current schema of RIA tables in correct project
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (function() {
  const fs = require('fs');
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

console.log(`Connecting to RIA Hunter project: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const riaTableNames = [
    'ria_profiles', 
    'narratives', 
    'control_persons', 
    'ria_private_funds', 
    'ria_fund_marketers'
  ];

  console.log('Checking RIA tables schema and data counts:');
  console.log('='.repeat(60));
  
  for (const tableName of riaTableNames) {
    try {
      // Check if table exists and get count
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.message.includes('does not exist')) {
          console.log(`❌ ${tableName}: Table does not exist`);
        } else {
          console.log(`⚠️  ${tableName}: Error - ${error.message}`);
        }
        continue;
      }

      console.log(`✅ ${tableName}: ${count || 0} records`);

      // For narratives table, check the embedding column specifically
      if (tableName === 'narratives') {
        try {
          const { data: sampleData, error: sampleError } = await supabase
            .from('narratives')
            .select('id, embedding')
            .not('embedding', 'is', null)
            .limit(1);

          if (sampleError) {
            console.log(`   🔍 Embedding check failed: ${sampleError.message}`);
          } else if (sampleData && sampleData.length > 0) {
            const embedding = sampleData[0].embedding;
            if (Array.isArray(embedding)) {
              console.log(`   📐 Embedding dimension: ${embedding.length}`);
              console.log(`   📊 Sample embedding values: [${embedding.slice(0,3).join(', ')}...]`);
            } else {
              console.log(`   📐 Embedding type: ${typeof embedding}`);
            }
          } else {
            console.log(`   📐 No embeddings found (all null)`);
          }
        } catch (embErr) {
          console.log(`   🔍 Embedding analysis error: ${embErr.message}`);
        }
      }

      // Get a sample record to see the structure
      if (count > 0) {
        try {
          const { data: sampleRec, error: sampleErr } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

          if (!sampleErr && sampleRec && sampleRec.length > 0) {
            const columns = Object.keys(sampleRec[0]);
            console.log(`   📋 Columns: ${columns.join(', ')}`);
          }
        } catch (structErr) {
          console.log(`   📋 Structure check failed: ${structErr.message}`);
        }
      }

    } catch (err) {
      console.log(`💥 ${tableName}: Connection error - ${err.message}`);
    }
    console.log('');
  }
  
  console.log('='.repeat(60));
  console.log('RIA Hunter project schema check complete');
}

checkSchema();