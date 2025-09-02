const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function diagnoseSemanticSearch() {
  console.log('🔍 SEMANTIC SEARCH DIAGNOSTIC\n')
  console.log('=' .repeat(50))
  
  // 1. Check narratives table structure
  console.log('\n1. CHECKING NARRATIVES TABLE STRUCTURE:')
  const { data: columns, error: colError } = await supabase
    .from('narratives')
    .select('*')
    .limit(0)
  
  if (colError) {
    console.log('❌ Error accessing narratives table:', colError.message)
  } else {
    console.log('✅ Narratives table accessible')
  }
  
  // 2. Check sample narrative
  console.log('\n2. CHECKING SAMPLE NARRATIVE:')
  const { data: sample, error: sampleError } = await supabase
    .from('narratives')
    .select('crd_number, embedding')
    .limit(1)
    .single()
  
  if (sampleError) {
    console.log('❌ Error fetching sample:', sampleError.message)
  } else if (sample) {
    console.log('✅ Found narrative for CRD:', sample.crd_number)
    
    // Check embedding format
    if (sample.embedding) {
      const embeddingType = typeof sample.embedding
      console.log('   Embedding type:', embeddingType)
      
      if (embeddingType === 'string') {
        console.log('   ⚠️  Embedding is STRING (length:', sample.embedding.length, 'chars)')
        console.log('   First 100 chars:', sample.embedding.substring(0, 100))
        
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(sample.embedding)
          console.log('   ✅ Can parse as JSON array with', parsed.length, 'dimensions')
        } catch (e) {
          console.log('   ❌ Cannot parse as JSON:', e.message)
        }
      } else if (Array.isArray(sample.embedding)) {
        console.log('   ✅ Embedding is ARRAY with', sample.embedding.length, 'dimensions')
      } else if (sample.embedding && typeof sample.embedding === 'object') {
        console.log('   🔍 Embedding is OBJECT:', Object.keys(sample.embedding))
      } else {
        console.log('   ❓ Unknown embedding format')
      }
    } else {
      console.log('   ❌ No embedding found')
    }
  }
  
  // 3. Count narratives with embeddings
  console.log('\n3. COUNTING NARRATIVES WITH EMBEDDINGS:')
  const { count: totalCount } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
  
  const { count: withEmbeddings } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)
  
  console.log(`   Total narratives: ${totalCount}`)
  console.log(`   With embeddings: ${withEmbeddings}`)
  console.log(`   Coverage: ${((withEmbeddings/totalCount)*100).toFixed(1)}%`)
  
  // 4. Test match_narratives RPC with a dummy embedding
  console.log('\n4. TESTING MATCH_NARRATIVES RPC:')
  
  // Create a dummy 768-dimension embedding
  const dummyEmbedding = new Array(768).fill(0.01)
  
  try {
    const { data: matches, error: rpcError } = await supabase.rpc('match_narratives', {
      query_embedding: dummyEmbedding,
      match_threshold: 0.1,
      match_count: 5
    })
    
    if (rpcError) {
      console.log('❌ RPC Error:', rpcError.message)
      console.log('   Error details:', JSON.stringify(rpcError, null, 2))
    } else if (matches && matches.length > 0) {
      console.log('✅ RPC returned', matches.length, 'matches')
      console.log('   First match:', {
        crd: matches[0].crd_number,
        similarity: matches[0].similarity
      })
    } else {
      console.log('⚠️  RPC returned 0 matches')
      console.log('   This suggests embeddings might be stored incorrectly')
    }
  } catch (e) {
    console.log('❌ RPC call failed:', e.message)
  }
  
  // 5. Check if HNSW index exists
  console.log('\n5. CHECKING HNSW INDEX:')
  const { data: indexes, error: indexError } = await supabase
    .rpc('get_indexes', {}) // This might not exist, but let's try
    .catch(() => ({ data: null, error: 'Function not found' }))
  
  if (indexError) {
    console.log('   Cannot check indexes directly')
  } else if (indexes) {
    console.log('   Indexes:', indexes)
  }
  
  // 6. Test with actual Vertex AI embedding
  console.log('\n6. TESTING WITH REAL VERTEX AI EMBEDDING:')
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || 'us-central1'
  
  console.log('   Project ID:', projectId)
  console.log('   Location:', location)
  
  if (projectId) {
    try {
      const { GoogleAuth } = require('google-auth-library')
      const auth = new GoogleAuth({ 
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'gcp-key.json'
      })
      
      const accessToken = await auth.getAccessToken()
      
      if (accessToken) {
        console.log('   ✅ Google Auth successful')
        
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005:predict`
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ content: 'retirement planning financial advisor' }]
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          const embedding = result?.predictions?.[0]?.embeddings?.values
          
          if (embedding && embedding.length === 768) {
            console.log('   ✅ Generated 768-dim embedding')
            
            // Test with real embedding
            const { data: realMatches, error: realError } = await supabase.rpc('match_narratives', {
              query_embedding: embedding,
              match_threshold: 0.3,
              match_count: 10
            })
            
            if (realError) {
              console.log('   ❌ RPC with real embedding failed:', realError.message)
            } else if (realMatches && realMatches.length > 0) {
              console.log('   ✅ Found', realMatches.length, 'semantic matches!')
              console.log('   Top match:', {
                crd: realMatches[0].crd_number,
                similarity: realMatches[0].similarity
              })
            } else {
              console.log('   ⚠️  No matches even with real embedding')
            }
          } else {
            console.log('   ❌ Invalid embedding dimensions:', embedding?.length)
          }
        } else {
          const error = await response.text()
          console.log('   ❌ Vertex AI error:', response.status, error.substring(0, 200))
        }
      } else {
        console.log('   ❌ Could not get access token')
      }
    } catch (e) {
      console.log('   ❌ Vertex AI test failed:', e.message)
    }
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('DIAGNOSTIC COMPLETE')
}

diagnoseSemanticSearch().catch(console.error)
