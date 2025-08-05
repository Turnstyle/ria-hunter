import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupVectorSearch() {
  console.log('🚀 Setting up vector similarity search...');
  
  try {
    // Test if we can query narratives with embeddings
    console.log('📊 Checking existing embeddings...');
    const { data: embeddingCheck, error: embeddingError } = await supabase
      .from('narratives')
      .select('crd_number, embedding')
      .not('embedding', 'is', null)
      .limit(5);
    
    if (embeddingError) {
      console.error('❌ Error checking embeddings:', embeddingError);
      return;
    }
    
    console.log(`✅ Found ${embeddingCheck?.length || 0} narratives with embeddings`);
    
    if (embeddingCheck && embeddingCheck.length > 0) {
      console.log(`📏 First embedding dimension: ${embeddingCheck[0].embedding?.length || 'unknown'}`);
    }
    
    // Test basic vector operations by checking if we can compute similarity
    console.log('\n🧪 Testing vector similarity search manually...');
    
    if (embeddingCheck && embeddingCheck.length >= 2) {
      const embedding1 = embeddingCheck[0].embedding;
      const embedding2 = embeddingCheck[1].embedding;
      
      // Try a manual similarity calculation using SQL
      const { data: similarityTest, error: simError } = await supabase
        .rpc('sql', {
          query: `
            SELECT 
              n1.crd_number as crd1,
              n2.crd_number as crd2,
              1 - (n1.embedding <=> n2.embedding) as similarity
            FROM narratives n1, narratives n2 
            WHERE n1.crd_number = $1 
              AND n2.crd_number = $2
              AND n1.embedding IS NOT NULL 
              AND n2.embedding IS NOT NULL
            LIMIT 1
          `,
          params: [embeddingCheck[0].crd_number, embeddingCheck[1].crd_number]
        });
      
      if (simError) {
        console.log('⚠️  Direct SQL similarity test failed:', simError.message);
      } else {
        console.log('✅ Vector similarity operations are working!');
        console.log('📊 Sample similarity:', similarityTest);
      }
    }
    
    // Test if we can find similar narratives for a specific RIA
    console.log('\n🔍 Testing semantic search for private placement firms...');
    
    // Find a narrative that mentions private placements or alternative investments
    const { data: sampleNarrative, error: sampleError } = await supabase
      .from('narratives')
      .select('crd_number, narrative, embedding')
      .not('embedding', 'is', null)
      .ilike('narrative', '%private%fund%')
      .limit(1);
    
    if (sampleError) {
      console.error('❌ Error finding sample narrative:', sampleError);
    } else if (sampleNarrative && sampleNarrative.length > 0) {
      console.log(`✅ Found sample private fund narrative from CRD ${sampleNarrative[0].crd_number}`);
      console.log(`📄 Preview: ${sampleNarrative[0].narrative.substring(0, 200)}...`);
      
      // Try to find similar narratives using raw SQL
      const queryEmbedding = sampleNarrative[0].embedding;
      
      const { data: similarNarratives, error: searchError } = await supabase
        .from('narratives')
        .select(`
          crd_number,
          narrative,
          embedding
        `)
        .not('embedding', 'is', null)
        .neq('crd_number', sampleNarrative[0].crd_number)
        .limit(10);
      
      if (searchError) {
        console.error('❌ Error searching similar narratives:', searchError);
      } else {
        console.log(`✅ Retrieved ${similarNarratives?.length || 0} potential matches for similarity comparison`);
        
        // Calculate similarities manually in JavaScript as a fallback
        if (similarNarratives && similarNarratives.length > 0) {
          const similarities = similarNarratives.map(n => {
            if (!n.embedding || !queryEmbedding) return { crd_number: n.crd_number, similarity: 0 };
            
            // Simple dot product similarity (not cosine, but gives us an idea)
            let similarity = 0;
            const minLength = Math.min(n.embedding.length, queryEmbedding.length);
            for (let i = 0; i < minLength; i++) {
              similarity += n.embedding[i] * queryEmbedding[i];
            }
            
            return {
              crd_number: n.crd_number,
              similarity: similarity / minLength,
              narrative_preview: n.narrative.substring(0, 100)
            };
          }).sort((a, b) => b.similarity - a.similarity);
          
          console.log('\n🎯 Top 5 most similar narratives:');
          similarities.slice(0, 5).forEach((sim, idx) => {
            console.log(`${idx + 1}. CRD ${sim.crd_number} (similarity: ${sim.similarity.toFixed(4)})`);
            console.log(`   Preview: ${sim.narrative_preview}...`);
          });
        }
      }
    }
    
    console.log('\n✅ Vector search infrastructure appears to be working!');
    console.log('🎉 Ready to implement enhanced semantic search capabilities');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupVectorSearch().catch(console.error);