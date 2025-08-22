// Check narratives table state after reset
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNarrativesState() {
  console.log('📋 Checking narratives table state after reset...');
  console.log('='.repeat(50));
  
  try {
    // Check if table exists and get count
    const { count, error } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ narratives table does not exist - migration may not have applied');
        console.log('   We need to create the table manually');
        return;
      } else {
        console.log('⚠️  Error checking narratives:', error.message);
        return;
      }
    }

    console.log(`✅ narratives table exists with ${count || 0} records`);

    // Try to get the structure by attempting to select columns
    try {
      const { data: structure, error: structError } = await supabase
        .from('narratives')
        .select('id, crd_number, narrative, embedding')
        .limit(1);

      if (structError) {
        console.log('⚠️  Structure check error:', structError.message);
      } else {
        console.log('✅ Table structure is accessible');
        console.log('   Columns: id, crd_number, narrative, embedding');
      }
    } catch (structErr) {
      console.log('⚠️  Structure query failed:', structErr.message);
    }

    // Test if we can insert a test record to verify the schema
    console.log('\n📝 Testing schema with insert/delete...');
    
    try {
      // Try to insert a test record without embedding
      const { data: insertData, error: insertError } = await supabase
        .from('narratives')
        .insert({
          crd_number: 999999,
          narrative: 'Test narrative for schema verification',
          embedding: null
        })
        .select()
        .single();

      if (insertError) {
        console.log('❌ Insert test failed:', insertError.message);
        console.log('   This suggests schema issues');
      } else {
        console.log('✅ Insert test passed - schema is working');
        
        // Clean up test record
        await supabase
          .from('narratives')
          .delete()
          .eq('id', insertData.id);
        
        console.log('✅ Test record cleaned up');
      }
    } catch (insertErr) {
      console.log('❌ Insert/delete test error:', insertErr.message);
    }

  } catch (err) {
    console.error('💥 Check failed:', err.message);
  }
  
  console.log('='.repeat(50));
  console.log('📋 Narratives table state check complete');
}

checkNarrativesState();
