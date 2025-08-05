#!/usr/bin/env node

/**
 * Simple API test that simulates what the /api/ask endpoint should return
 * This bypasses the Vertex AI requirement and shows the data flow
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function simulateApiCall(query) {
    console.log(`🔍 Simulating API call: "${query}"\n`);
    
    // Extract potential search terms from the query (same logic as API)
    const queryLower = query.toLowerCase();
    const stateMatch = queryLower.match(/\b(in|from|near)\s+([a-z]{2})\b/);
    const state = stateMatch ? stateMatch[2].toUpperCase() : null;
    
    // Build the query (same logic as API)
    let supabaseQuery = supabase
        .from('ria_profiles')
        .select('*');
    
    // Apply filters based on query content
    if (state) {
        console.log(`📍 Filtering by state: ${state}`);
        supabaseQuery = supabaseQuery.eq('state', state);
    }
    
    // Order by AUM if query mentions size/largest/biggest
    if (queryLower.includes('largest') || queryLower.includes('biggest') || queryLower.includes('top')) {
        console.log('📊 Ordering by AUM (largest first)');
        supabaseQuery = supabaseQuery.order('aum', { ascending: false });
    }
    
    // Limit results
    supabaseQuery = supabaseQuery.limit(5);
    
    const { data: advisers, error } = await supabaseQuery;
    
    if (error) {
        console.error('❌ Database error:', error);
        return;
    }
    
    if (!advisers || advisers.length === 0) {
        console.log('❌ No advisers found');
        return;
    }
    
    console.log(`✅ Found ${advisers.length} advisers:\n`);
    
    // Format the results (same as API would)
    advisers.forEach((adviser, index) => {
        console.log(`${index + 1}. ${adviser.legal_name}`);
        console.log(`   - CRD Number: ${adviser.crd_number}`);
        console.log(`   - Location: ${adviser.city}, ${adviser.state}`);
        console.log(`   - Assets Under Management: ${adviser.aum ? `$${adviser.aum.toLocaleString()}` : 'Not disclosed'}`);
        console.log('');
    });
    
    // Show what the API response would look like
    const apiResponse = {
        answer: `Based on the data, here are the ${advisers.length} advisers I found matching your query "${query}":`,
        sources: advisers.map(adviser => ({
            firm_name: adviser.legal_name,
            crd_number: adviser.crd_number,
            city: adviser.city,
            state: adviser.state,
            aum: adviser.aum,
        }))
    };
    
    console.log('📋 API Response would be:');
    console.log(JSON.stringify(apiResponse, null, 2));
}

// Test different queries
async function runTests() {
    await simulateApiCall("largest RIA in Texas");
    console.log('\n' + '='.repeat(50) + '\n');
    await simulateApiCall("top RIA in California");
    console.log('\n' + '='.repeat(50) + '\n');
    await simulateApiCall("Fisher Investments");
}

runTests().catch(console.error);