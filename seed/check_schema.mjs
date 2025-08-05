#!/usr/bin/env node

/**
 * Check the actual database schema and sample data
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
    try {
        console.log('Checking ria_profiles table schema and sample data...\n');
        
        // Get a few sample records to see the actual column names
        const { data: sampleData, error: sampleError } = await supabase
            .from('ria_profiles')
            .select('*')
            .limit(3);
        
        if (sampleError) {
            console.error('Error fetching sample data:', sampleError);
        } else {
            console.log('Sample records:');
            console.log(JSON.stringify(sampleData, null, 2));
        }

        // Check if we can query by state
        console.log('\nTesting TX query...');
        const { data: txData, error: txError } = await supabase
            .from('ria_profiles')
            .select('*')
            .eq('state', 'TX')
            .order('aum', { ascending: false })
            .limit(5);
        
        if (txError) {
            console.error('Error querying TX data:', txError);
        } else {
            console.log(`Found ${txData?.length || 0} TX records`);
            if (txData && txData.length > 0) {
                console.log('Top TX record:', JSON.stringify(txData[0], null, 2));
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main();