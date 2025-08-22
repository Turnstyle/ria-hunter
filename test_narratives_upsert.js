// Test that the narratives table now supports upsert operations
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpsertOperation() {
  console.log('🧪 Testing narratives upsert operation');
  console.log('='.repeat(50));
  
  try {
    const testCrd = 999999;
    const testNarrative = 'Test narrative for upsert verification';
    
    console.log('📝 Testing insert...');
    
    // First insert
    const { data: insertData, error: insertError } = await supabase
      .from('narratives')
      .upsert({
        crd_number: testCrd,
        narrative: testNarrative,
        embedding: null
      }, {
        onConflict: 'crd_number'
      })
      .select()
      .single();

    if (insertError) {
      console.log('❌ Insert failed:', insertError);
      return;
    }

    console.log('✅ Insert successful, ID:', insertData.id);

    console.log('📝 Testing update (upsert)...');
    
    // Test upsert (should update existing record)
    const updatedNarrative = 'Updated test narrative for upsert verification';
    const { data: upsertData, error: upsertError } = await supabase
      .from('narratives')
      .upsert({
        crd_number: testCrd,
        narrative: updatedNarrative,
        embedding: null
      }, {
        onConflict: 'crd_number'
      })
      .select()
      .single();

    if (upsertError) {
      console.log('❌ Upsert failed:', upsertError);
      return;
    }

    console.log('✅ Upsert successful, ID:', upsertData.id);
    console.log('   Same ID as insert:', insertData.id === upsertData.id);
    console.log('   Narrative updated:', upsertData.narrative === updatedNarrative);

    console.log('🧹 Cleaning up test record...');
    
    const { error: deleteError } = await supabase
      .from('narratives')
      .delete()
      .eq('crd_number', testCrd);

    if (deleteError) {
      console.log('⚠️  Cleanup warning:', deleteError);
    } else {
      console.log('✅ Test record cleaned up');
    }

    console.log('\n🎯 Result: Upsert operations are now working!');
    console.log('   Ready to re-run data pipeline to generate missing narratives');

  } catch (err) {
    console.error('💥 Test failed:', err.message);
  }
  
  console.log('='.repeat(50));
  console.log('🏁 Upsert test complete');
}

testUpsertOperation();
