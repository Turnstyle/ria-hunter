#!/usr/bin/env node

/**
 * Check embedding status in the narratives table
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function checkEmbeddings() {
    console.log('🔍 Checking embedding status...\n');
    
    // Count total narratives
    const { count: totalCount, error: totalError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true });
    
    if (totalError) {
        console.error('❌ Error counting total narratives:', totalError);
        return;
    }
    
    // Count narratives with embeddings
    const { count: withEmbeddings, error: embeddingError } = await supabase
        .from('narratives')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
    
    if (embeddingError) {
        console.error('❌ Error counting narratives with embeddings:', embeddingError);
        return;
    }
    
    console.log('📊 Embedding Status:');
    console.log(`   Total narratives: ${totalCount}`);
    console.log(`   With embeddings: ${withEmbeddings}`);
    console.log(`   Without embeddings: ${totalCount - withEmbeddings}`);
    console.log(`   Completion: ${((withEmbeddings / totalCount) * 100).toFixed(1)}%`);
    
    // Sample embedding info
    const { data: sampleEmbedding, error: sampleError } = await supabase
        .from('narratives')
        .select('crd_number, embedding')
        .not('embedding', 'is', null)
        .limit(1);
    
    if (!sampleError && sampleEmbedding && sampleEmbedding.length > 0) {
        console.log(`\n✅ Sample embedding: CRD ${sampleEmbedding[0].crd_number} has ${sampleEmbedding[0].embedding?.length || 0}-dimensional vector`);
    }
}

checkEmbeddings().catch(console.error);