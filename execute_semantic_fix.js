const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function executeSemanticFix() {
  console.log('🚀 FIXING SEMANTIC SEARCH\n')
  console.log('=' .repeat(50))
  
  try {
    // Step 1: Check current state
    console.log('\n1. CHECKING CURRENT STATE:')
    const { data: currentState, error: stateError } = await supabase
      .from('narratives')
      .select('embedding, embedding_vector', { count: 'exact', head: true })
    
    if (stateError) {
      console.log('❌ Error:', stateError.message)
      return
    }
    
    console.log('   Total narratives in table')
    
    // Step 2: Check if embedding_vector column exists
    console.log('\n2. CHECKING VECTOR COLUMN:')
    const { data: sample, error: sampleError } = await supabase
      .from('narratives')
      .select('crd_number, embedding, embedding_vector')
      .not('embedding', 'is', null)
      .limit(1)
      .single()
    
    if (sampleError) {
      console.log('❌ Error:', sampleError.message)
      
      if (sampleError.message.includes('column')) {
        console.log('\n⚠️  VECTOR COLUMN DOES NOT EXIST!')
        console.log('\n📋 COPY AND RUN THIS SQL IN SUPABASE SQL EDITOR:')
        console.log('=' .repeat(50))
        console.log(`
ALTER TABLE narratives 
ADD COLUMN embedding_vector vector(768);

UPDATE narratives 
SET embedding_vector = embedding::json::text::vector(768)
WHERE embedding IS NOT NULL;

CREATE INDEX narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops);
        `)
        console.log('=' .repeat(50))
        console.log('\nThen run this script again.')
        return
      }
    } else {
      console.log('✅ Sample narrative found:', sample.crd_number)
      
      if (sample.embedding_vector) {
        console.log('✅ Vector column exists and has data!')
        
        // Check if it's actually a vector
        if (Array.isArray(sample.embedding_vector)) {
          console.log('✅ Vector is proper array with', sample.embedding_vector.length, 'dimensions')
        } else {
          console.log('⚠️  Vector column exists but data type is:', typeof sample.embedding_vector)
        }
      } else {
        console.log('⚠️  Vector column exists but is empty')
        console.log('\n📋 RUN THIS SQL TO CONVERT EMBEDDINGS:')
        console.log('=' .repeat(50))
        console.log(`
UPDATE narratives 
SET embedding_vector = embedding::json::text::vector(768)
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;
        `)
        console.log('=' .repeat(50))
      }
    }
    
    // Step 3: Test the match_narratives function
    console.log('\n3. TESTING MATCH_NARRATIVES FUNCTION:')
    
    // Create a test embedding
    const testEmbedding = new Array(768).fill(0.01)
    
    const { data: matches, error: matchError } = await supabase.rpc('match_narratives', {
      query_embedding: testEmbedding,
      match_threshold: 0.1,
      match_count: 5
    })
    
    if (matchError) {
      console.log('❌ Function error:', matchError.message)
      
      if (matchError.message.includes('timeout')) {
        console.log('\n⚠️  FUNCTION IS TIMING OUT - EMBEDDINGS NOT PROPERLY INDEXED')
        console.log('\n📋 RUN THIS SQL TO FIX:')
        console.log('=' .repeat(50))
        console.log(`
-- First, convert embeddings if not done
UPDATE narratives 
SET embedding_vector = embedding::json::text::vector(768)
WHERE embedding IS NOT NULL 
  AND embedding_vector IS NULL;

-- Then create index
CREATE INDEX IF NOT EXISTS narratives_embedding_vector_hnsw_idx 
ON narratives 
USING hnsw (embedding_vector vector_cosine_ops);

-- Finally, update the function
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  crd_number text,
  similarity float,
  legal_name text,
  narrative text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.crd_number,
    1 - (n.embedding_vector <=> query_embedding) as similarity,
    n.legal_name,
    n.narrative
  FROM narratives n
  WHERE n.embedding_vector IS NOT NULL
    AND 1 - (n.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY n.embedding_vector <=> query_embedding
  LIMIT match_count;
END;
$$;
        `)
        console.log('=' .repeat(50))
      }
    } else if (matches && matches.length > 0) {
      console.log('✅ SEMANTIC SEARCH IS WORKING!')
      console.log('   Found', matches.length, 'matches')
      console.log('   Top match:', {
        crd: matches[0].crd_number,
        similarity: matches[0].similarity
      })
    } else {
      console.log('⚠️  Function works but returned 0 matches')
      console.log('   This might mean the threshold is too high or embeddings need regeneration')
    }
    
    // Step 4: Test with real query
    console.log('\n4. TESTING WITH REAL QUERY:')
    
    const projectId = process.env.GOOGLE_PROJECT_ID
    const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || 'us-central1'
    
    if (!projectId) {
      console.log('⚠️  No Google Project ID found')
      return
    }
    
    try {
      const { GoogleAuth } = require('google-auth-library')
      const auth = new GoogleAuth({ 
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      })
      
      const accessToken = await auth.getAccessToken()
      
      if (!accessToken) {
        console.log('❌ Could not authenticate with Google')
        return
      }
      
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [{ content: 'retirement planning investment advisor' }]
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        console.log('❌ Vertex AI error:', response.status)
        console.log('   ', error.substring(0, 200))
        return
      }
      
      const result = await response.json()
      const realEmbedding = result?.predictions?.[0]?.embeddings?.values
      
      if (!realEmbedding || realEmbedding.length !== 768) {
        console.log('❌ Invalid embedding from Vertex AI')
        return
      }
      
      console.log('✅ Generated real embedding (768 dimensions)')
      
      // Test with real embedding
      const { data: realMatches, error: realError } = await supabase.rpc('match_narratives', {
        query_embedding: realEmbedding,
        match_threshold: 0.3,
        match_count: 5
      })
      
      if (realError) {
        console.log('❌ Error with real query:', realError.message)
      } else if (realMatches && realMatches.length > 0) {
        console.log('✅ SEMANTIC SEARCH FULLY WORKING!')
        console.log(`   Found ${realMatches.length} relevant RIAs for "retirement planning"`)
        console.log('\n   Top 3 matches:')
        realMatches.slice(0, 3).forEach((match, i) => {
          console.log(`   ${i + 1}. ${match.legal_name || 'Unknown'} (CRD: ${match.crd_number})`)
          console.log(`      Similarity: ${(match.similarity * 100).toFixed(1)}%`)
        })
      } else {
        console.log('⚠️  No matches found for retirement planning query')
      }
      
    } catch (e) {
      console.log('❌ Error testing real query:', e.message)
    }
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message)
  }
  
  console.log('\n' + '=' .repeat(50))
  console.log('DIAGNOSTIC COMPLETE')
}

executeSemanticFix().catch(console.error)
