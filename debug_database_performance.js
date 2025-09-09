#!/usr/bin/env node

// Quick database performance diagnostic
// This will test each layer to find where the bottleneck is

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDatabasePerformance() {
  console.log('🔍 Database Performance Diagnostic');
  console.log('=' .repeat(50));
  
  // Test 1: Basic connection
  console.log('\n1. Testing basic connection...');
  const startTime = Date.now();
  try {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('count')
      .limit(1);
    
    const elapsed = Date.now() - startTime;
    if (error) {
      console.error('❌ Connection failed:', error.message);
    } else {
      console.log(`✅ Connection successful (${elapsed}ms)`);
    }
  } catch (err) {
    console.error('❌ Connection error:', err.message);
  }

  // Test 2: Simple query with filters (St. Louis query)
  console.log('\n2. Testing St. Louis RIA query...');
  const queryStart = Date.now();
  try {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .ilike('city', '%ST LOUIS%')
      .eq('state', 'MO')
      .order('aum', { ascending: false })
      .limit(10);
    
    const queryElapsed = Date.now() - queryStart;
    if (error) {
      console.error('❌ Query failed:', error.message);
    } else {
      console.log(`✅ Query successful: ${data.length} results (${queryElapsed}ms)`);
      if (data.length > 0) {
        console.log(`   Top result: ${data[0].legal_name} - $${data[0].aum?.toLocaleString() || 'N/A'}`);
      }
    }
  } catch (err) {
    console.error('❌ Query error:', err.message);
  }

  // Test 3: Check if indexes exist
  console.log('\n3. Checking database indexes...');
  try {
    const { data: indexes, error } = await supabase.rpc('get_table_indexes', { table_name: 'ria_profiles' }).catch(() => null);
    
    if (error) {
      console.log('⚠️  Cannot check indexes (might need custom function)');
    } else {
      console.log('📊 Indexes found:', indexes?.length || 'unknown');
    }
  } catch (err) {
    console.log('⚠️  Index check not available');
  }

  // Test 4: Test RPC function directly
  console.log('\n4. Testing RPC function (search_rias_with_string_embedding)...');
  const rpcStart = Date.now();
  try {
    // Create a simple embedding string for testing
    const testEmbedding = JSON.stringify(Array(768).fill(0).map(() => Math.random()));
    
    const { data, error } = await supabase.rpc('search_rias_with_string_embedding', {
      query_embedding_string: testEmbedding,
      match_threshold: 0.3,
      match_count: 5,
      state_filter: 'MO',
      min_vc_activity: 0,
      min_aum: 0
    });
    
    const rpcElapsed = Date.now() - rpcStart;
    if (error) {
      console.error('❌ RPC failed:', error.message);
      console.error('   Full error:', error);
    } else {
      console.log(`✅ RPC successful: ${data.length} results (${rpcElapsed}ms)`);
    }
  } catch (err) {
    console.error('❌ RPC error:', err.message);
  }

  // Test 5: Check semantic search data
  console.log('\n5. Checking semantic search data...');
  try {
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number')
      .not('embedding_proper', 'is', null)
      .limit(5);
    
    if (error) {
      console.error('❌ Embedding check failed:', error.message);
    } else {
      console.log(`✅ Found ${data.length} narratives with embeddings`);
    }
    
    // Check total count
    const { count, error: countError } = await supabase
      .from('narratives')
      .select('crd_number', { count: 'exact' })
      .not('embedding_proper', 'is', null);
      
    if (!countError) {
      console.log(`   Total embeddings available: ${count}`);
    }
  } catch (err) {
    console.error('❌ Embedding data check error:', err.message);
  }

  // Test 6: Check if HNSW index exists and is working
  console.log('\n6. Testing HNSW index performance...');
  const indexStart = Date.now();
  try {
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, embedding_proper')
      .not('embedding_proper', 'is', null)
      .limit(1);
    
    if (error || !data || data.length === 0) {
      console.error('❌ No embedding data found');
    } else {
      // Test vector similarity search
      const testVector = data[0].embedding_proper;
      const vectorStart = Date.now();
      
      const { data: similarResults, error: vectorError } = await supabase
        .rpc('match_narratives', {
          query_embedding: testVector,
          match_threshold: 0.3,
          match_count: 5
        });
        
      const vectorElapsed = Date.now() - vectorStart;
      if (vectorError) {
        console.error('❌ Vector search failed:', vectorError.message);
      } else {
        console.log(`✅ Vector search: ${similarResults.length} results (${vectorElapsed}ms)`);
      }
    }
    
    const indexElapsed = Date.now() - indexStart;
    console.log(`   Total index test time: ${indexElapsed}ms`);
  } catch (err) {
    console.error('❌ HNSW index test error:', err.message);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('🏁 Diagnostic complete');
}

// Run the diagnostic
testDatabasePerformance().catch(console.error);
