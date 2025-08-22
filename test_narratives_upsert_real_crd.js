// Test upsert with a real CRD number that exists in ria_profiles
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://llusjnpltqxhokycwzry.supabase.co";
const supabaseKey = (function() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
  return match ? match[1].trim() : null;
})();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpsertWithRealCrd() {
  console.log('🧪 Testing narratives upsert with real CRD number');
  console.log('='.repeat(50));
  
  try {
    // First, get a CRD number that exists in ria_profiles but NOT in narratives
    console.log('🔍 Finding a CRD number to test with...');
    
    const { data: profilesWithoutNarratives, error: findError } = await supabase
      .from('ria_profiles')
      .select('crd_number')
      .not('crd_number', 'in', `(SELECT crd_number FROM narratives WHERE crd_number IS NOT NULL)`)
      .limit(1);

    if (findError || !profilesWithoutNarratives || profilesWithoutNarratives.length === 0) {
      console.log('⚠️  Could not find profile without narrative, using existing one...');
      
      // Use an existing narrative's CRD for testing
      const { data: existingNarrative } = await supabase
        .from('narratives')
        .select('crd_number')
        .limit(1);
      
      if (!existingNarrative || existingNarrative.length === 0) {
        console.log('❌ No narratives found to test with');
        return;
      }
      
      const testCrd = existingNarrative[0].crd_number;
      console.log(`📋 Using existing CRD: ${testCrd}`);
      
      // Test updating existing narrative
      const testNarrative = `Updated test narrative ${Date.now()}`;
      
      const { data: upsertData, error: upsertError } = await supabase
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

      if (upsertError) {
        console.log('❌ Upsert failed:', upsertError);
        return;
      }

      console.log('✅ Upsert successful!');
      console.log('   Updated narrative:', upsertData.narrative);
      
    } else {
      const testCrd = profilesWithoutNarratives[0].crd_number;
      console.log(`📋 Testing with CRD: ${testCrd} (no existing narrative)`);
      
      const testNarrative = `Test narrative for CRD ${testCrd}`;
      
      // Test inserting new narrative
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

      console.log('✅ Insert successful!');
      console.log('   New narrative ID:', insertData.id);
      
      // Test updating the same narrative
      const updatedNarrative = `Updated test narrative for CRD ${testCrd}`;
      
      const { data: updateData, error: updateError } = await supabase
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

      if (updateError) {
        console.log('❌ Update failed:', updateError);
        return;
      }

      console.log('✅ Update successful!');
      console.log('   Same ID:', insertData.id === updateData.id);
      console.log('   Updated content:', updateData.narrative);
      
      // Clean up test narrative
      await supabase
        .from('narratives')
        .delete()
        .eq('crd_number', testCrd);
        
      console.log('✅ Test narrative cleaned up');
    }

    console.log('\n🎯 Result: Upsert operations are working correctly!');
    console.log('   Ready to re-run pipeline to generate ~103K missing narratives');

  } catch (err) {
    console.error('💥 Test failed:', err.message);
  }
  
  console.log('='.repeat(50));
  console.log('🏁 Real CRD upsert test complete');
}

testUpsertWithRealCrd();
