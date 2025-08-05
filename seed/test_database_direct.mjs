#!/usr/bin/env node

/**
 * Test the database directly to verify our seeding worked
 * This bypasses the API and tests the raw data
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function testDatabaseQueries() {
    console.log('🔍 Testing Database Queries...\n');
    
    // Test 1: Basic count
    console.log('1. Checking total records...');
    const { count: totalCount, error: countError } = await supabase
        .from('ria_profiles')
        .select('*', { count: 'exact', head: true });
    
    if (countError) {
        console.error('❌ Count error:', countError);
    } else {
        console.log(`✅ Total RIA profiles: ${totalCount}`);
    }

    // Test 2: Largest RIAs in Texas
    console.log('\n2. Finding largest RIAs in Texas...');
    const { data: txRias, error: txError } = await supabase
        .from('ria_profiles')
        .select('legal_name, city, state, aum')
        .eq('state', 'TX')
        .order('aum', { ascending: false })
        .limit(5);
    
    if (txError) {
        console.error('❌ TX query error:', txError);
    } else {
        console.log('✅ Top 5 Texas RIAs by AUM:');
        txRias.forEach((ria, i) => {
            console.log(`   ${i+1}. ${ria.legal_name} - ${ria.city}, TX - $${ria.aum?.toLocaleString() || 'N/A'}`);
        });
    }

    // Test 3: Search by name
    console.log('\n3. Testing name search...');
    const { data: searchResults, error: searchError } = await supabase
        .from('ria_profiles')
        .select('legal_name, city, state, aum')
        .ilike('legal_name', '%FISHER%')
        .limit(3);
    
    if (searchError) {
        console.error('❌ Search error:', searchError);
    } else {
        console.log('✅ Firms with "FISHER" in name:');
        searchResults.forEach((ria, i) => {
            console.log(`   ${i+1}. ${ria.legal_name} - ${ria.city}, ${ria.state} - $${ria.aum?.toLocaleString() || 'N/A'}`);
        });
    }

    // Test 4: Check narratives
    console.log('\n4. Testing narratives...');
    const { data: narrativesSample, error: narrativesError } = await supabase
        .from('narratives')
        .select('crd_number, narrative')
        .limit(3);
    
    if (narrativesError) {
        console.error('❌ Narratives error:', narrativesError);
    } else {
        console.log('✅ Sample narratives:');
        narrativesSample.forEach((item, i) => {
            console.log(`   ${i+1}. CRD ${item.crd_number}: ${item.narrative.substring(0, 100)}...`);
        });
    }

    // Test 5: Check embeddings
    console.log('\n5. Testing embeddings...');
    const { data: embeddingsSample, error: embeddingsError } = await supabase
        .from('narratives')
        .select('crd_number, embedding')
        .not('embedding', 'is', null)
        .limit(3);
    
    if (embeddingsError) {
        console.error('❌ Embeddings error:', embeddingsError);
    } else {
        console.log(`✅ Found ${embeddingsSample.length} records with embeddings`);
        if (embeddingsSample.length > 0) {
            console.log(`   Sample: CRD ${embeddingsSample[0].crd_number} has ${embeddingsSample[0].embedding?.length || 0}-dimensional embedding`);
        }
    }

    console.log('\n🎉 Database testing complete!');
}

testDatabaseQueries().catch(console.error);