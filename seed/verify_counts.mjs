#!/usr/bin/env node

/**
 * Verify row counts in Supabase tables
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
        // Count RIA profiles
        console.log('Verifying counts...');
        
        const { count: riaCount, error: riaError } = await supabase
            .from('ria_profiles')
            .select('*', { count: 'exact', head: true });
        
        if (riaError) {
            console.error('Error counting RIA profiles:', riaError);
        } else {
            console.log(`RIA Profiles count: ${riaCount}`);
        }

        // Count narratives
        const { count: narrativesCount, error: narrativesError } = await supabase
            .from('narratives')
            .select('*', { count: 'exact', head: true });
        
        if (narrativesError) {
            console.error('Error counting narratives:', narrativesError);
        } else {
            console.log(`Narratives count: ${narrativesCount}`);
        }

        // Alternative approach using RPC or direct SQL
        const { data: riaCountRpc, error: riaCountError } = await supabase
            .rpc('get_ria_profiles_count')
            .single();

        if (!riaCountError && riaCountRpc) {
            console.log(`RIA Profiles count (RPC): ${riaCountRpc}`);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main();