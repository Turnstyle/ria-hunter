import { supabaseAdmin } from './lib/supabaseAdmin';

async function runPhase1StepByStep() {
  console.log('🚀 Starting Phase 1: Vector Migration - Step by Step Approach');
  
  try {
    // Step 1: Check current state
    console.log('\n📊 Step 1: Checking current database state...');
    const { count: narrativeCount } = await supabaseAdmin
      .from('narratives')
      .select('*', { head: true, count: 'exact' })
      .not('embedding', 'is', null);
    
    console.log(`- Found ${narrativeCount} narratives with embeddings`);
    
    // Step 2: Add vector column (if not exists)
    console.log('\n🔧 Step 2: Adding vector column to narratives...');
    
    // We'll use a workaround - create a simple SQL view/function to execute raw SQL
    const addColumnSQL = `
      ALTER TABLE narratives ADD COLUMN IF NOT EXISTS embedding_vector vector(768);
    `;
    
    try {
      // Try to add the column using raw SQL through a database function
      // Since we can't execute raw SQL directly, let's check if the column exists first
      const { data: columnCheck } = await supabaseAdmin
        .from('narratives')
        .select('embedding_vector')
        .limit(1);
      
      console.log('✅ Vector column check completed');
      
    } catch (error: any) {
      if (error.message?.includes('column "embedding_vector" does not exist')) {
        console.log('❌ Vector column does not exist - needs manual creation');
        console.log('\n📋 Manual SQL to run in Supabase SQL Editor:');
        console.log('```sql');
        console.log('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('ALTER TABLE narratives ADD COLUMN embedding_vector vector(768);');
        console.log('```');
      } else {
        console.log('Column might already exist:', error.message);
      }
    }
    
    // Step 3: Convert sample embedding to test
    console.log('\n🧪 Step 3: Testing embedding conversion...');
    
    const { data: sampleNarrative } = await supabaseAdmin
      .from('narratives')
      .select('crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single();
    
    if (sampleNarrative) {
      try {
        const embeddingArray = JSON.parse(sampleNarrative.embedding as string);
        console.log(`✅ Sample embedding parsed: ${embeddingArray.length} dimensions`);
        
        // Try to convert to proper format for PostgreSQL vector
        const vectorString = '[' + embeddingArray.join(',') + ']';
        console.log(`✅ Vector format prepared (${vectorString.length} chars)`);
        
      } catch (parseError) {
        console.error('❌ Failed to parse sample embedding:', parseError);
      }
    }
    
    // Step 4: Manual migration instructions
    console.log('\n📋 Next steps (manual execution required):');
    console.log('1. Run the SQL migration in Supabase SQL Editor');
    console.log('2. Execute the embedding conversion function');
    console.log('3. Create HNSW indexes');
    
    console.log('\n📄 Copy this SQL to Supabase SQL Editor:');
    
  } catch (error) {
    console.error('❌ Step-by-step check failed:', error);
    throw error;
  }
}

// Run the step-by-step check
runPhase1StepByStep()
  .then(() => {
    console.log('\n✅ Phase 1 preparation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Preparation failed:', error);
    process.exit(1);
  });
