#!/usr/bin/env tsx
/**
 * Embedding Script for Existing RIA Data
 * 
 * Works with existing 103k+ profiles in database
 * Generates narratives and 768-dimensional embeddings
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { createAIService } from '../lib/ai-providers';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BATCH_SIZE = 50;

interface RIAProfile {
  crd_number: number;
  legal_name: string;
  city?: string;
  state?: string;
  aum?: number;
  private_fund_count?: number;
  private_fund_aum?: number;
}

function generateNarrative(profile: RIAProfile): string {
  const { legal_name, city, state, aum, crd_number, private_fund_count, private_fund_aum } = profile;
  
  const formattedAum = aum ? `$${aum.toLocaleString()}` : 'undisclosed assets';
  
  const privateFundInfo = private_fund_count && private_fund_count > 0
    ? ` They manage ${private_fund_count} private fund${private_fund_count === 1 ? '' : 's'} with $${(private_fund_aum || 0).toLocaleString()} in fund assets.`
    : '';
    
  return [
    `${legal_name} is a registered investment adviser`,
    city && state ? ` based in ${city}, ${state}` : state ? ` in ${state}` : '',
    `. CRD number: ${crd_number}.`,
    ` Managing ${formattedAum}.`,
    privateFundInfo
  ].join('');
}

async function processExistingData() {
  console.log('🚀 Starting embedding process for existing RIA data...\n');

  // Get total count
  const { count: totalProfiles } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Found ${totalProfiles} RIA profiles in database`);

  // Check existing narratives
  const { count: existingNarratives } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📝 Existing narratives: ${existingNarratives}`);
  console.log(`🎯 Need to process: ${totalProfiles} profiles\n`);

  const aiService = createAIService({ 
    provider: (process.env.AI_PROVIDER as 'vertex' | 'openai') || 'vertex' 
  });
  
  if (!aiService) {
    console.error('❌ Failed to initialize AI service');
    process.exit(1);
  }
  let processedCount = 0;
  let embeddedCount = 0;

  // Process profiles in batches
  const batchCount = Math.ceil(totalProfiles / BATCH_SIZE);
  
  for (let batch = 0; batch < batchCount; batch++) {
    const offset = batch * BATCH_SIZE;
    
    console.log(`📦 Processing batch ${batch + 1}/${batchCount} (${offset + 1}-${Math.min(offset + BATCH_SIZE, totalProfiles)})`);

    // Fetch batch of profiles
    const { data: profiles, error: fetchError } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('crd_number');

    if (fetchError || !profiles) {
      console.log(`❌ Error fetching batch ${batch + 1}:`, fetchError?.message);
      continue;
    }

    // Generate narratives and embeddings for each profile
    for (const profile of profiles) {
      try {
        // Check if narrative already exists
        const { data: existing } = await supabase
          .from('narratives')
          .select('id')
          .eq('crd_number', profile.crd_number)
          .single();

        if (existing) {
          console.log(`⏭️  CRD ${profile.crd_number}: Narrative already exists`);
          continue;
        }

        // Generate narrative
        const narrative = generateNarrative(profile);
        
        // Generate embedding
        const { embedding } = await aiService.generateEmbedding(narrative);
        
        // Insert narrative with embedding
        const { error: insertError } = await supabase
          .from('narratives')
          .insert({
            crd_number: profile.crd_number,
            narrative,
            embedding
          });

        if (insertError) {
          console.log(`❌ Error inserting CRD ${profile.crd_number}:`, insertError.message);
          continue;
        }

        processedCount++;
        embeddedCount++;
        
        if (processedCount % 10 === 0) {
          console.log(`✅ Processed ${processedCount} profiles (${((processedCount / totalProfiles) * 100).toFixed(1)}%)`);
        }

      } catch (error) {
        console.log(`❌ Error processing CRD ${profile.crd_number}:`, error.message);
      }
    }

    // Brief pause between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n🎉 Processing complete!');
  console.log(`📊 Summary:`);
  console.log(`  • Total profiles: ${totalProfiles}`);
  console.log(`  • Processed: ${processedCount}`);
  console.log(`  • Embedded: ${embeddedCount}`);
  console.log(`  • Success rate: ${((embeddedCount / totalProfiles) * 100).toFixed(1)}%`);
}

processExistingData().catch(console.error);
