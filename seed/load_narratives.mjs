#!/usr/bin/env node

/**
 * Load narratives JSON into Supabase
 * Handles bulk insert of narrative data
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
    try {
        // Load narratives JSON
        console.log('Loading narratives.json...');
        const narrativesData = JSON.parse(fs.readFileSync('seed/narratives.json', 'utf8'));
        console.log(`Loaded ${narrativesData.length} narratives`);

        // Transform data to match our schema
        console.log('Transforming data...');
        const records = narrativesData.map((item, index) => ({
            crd_number: index + 1, // Match the synthetic CRD numbers we used
            narrative: item.narrative || '',
            embedding: null // Will be populated later by embed_narratives.ts
        }));

        console.log(`Prepared ${records.length} records for insertion`);

        // Insert in batches
        const batchSize = 1000;
        let totalInserted = 0;

        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            
            try {
                const { data, error } = await supabase
                    .from('narratives')
                    .insert(batch);
                
                if (error) {
                    console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
                    continue;
                }
                
                totalInserted += batch.length;
                console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records (Total: ${totalInserted})`);
            } catch (err) {
                console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, err);
            }
        }

        console.log(`Completed! Total records inserted: ${totalInserted}`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();