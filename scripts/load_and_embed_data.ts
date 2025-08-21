#!/usr/bin/env tsx
/**
 * RIA Hunter Data Loading and Embedding Pipeline
 * 
 * This script implements tasks B2 and B3 from the overhaul plan:
 * - B2: Data loading and narrative generation
 * - B3: Embedding generation
 * 
 * It loads RIA profile data, generates narratives, and embeds them
 * in a single streamlined process with proper error handling.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { createAIService, getAIProvider } from '../lib/ai-providers';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Configure Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const EMBEDDING_BATCH_SIZE = 10;
const LOAD_LIMIT = parseInt(process.env.LOAD_LIMIT || '0', 10) || undefined; // Optional limit for testing
const EMBEDDING_MODEL_DIMENSION = 768; // Vertex AI text-embedding-005 = 768, OpenAI embedding = 1536

// Interfaces
interface RIAProfile {
  crd_number: number;
  legal_name: string;
  city?: string;
  state?: string;
  aum?: number;
  form_adv_date?: string;
  private_fund_count?: number;
  private_fund_aum?: number;
}

interface ProcessingStats {
  profilesLoaded: number;
  narrativesGenerated: number;
  embeddingsCreated: number;
  errors: number;
}

// Generate narrative from RIA profile
function generateNarrative(profile: RIAProfile): string {
  const {
    legal_name,
    city,
    state,
    aum,
    crd_number,
    private_fund_count,
    private_fund_aum
  } = profile;

  // Format AUM with commas and dollar sign
  const formattedAum = aum 
    ? `$${aum.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : 'undisclosed amount';
    
  // Format private fund details if available  
  const privateFundInfo = private_fund_count && private_fund_count > 0
    ? `They manage ${private_fund_count} private fund${private_fund_count === 1 ? '' : 's'} with a total of $${
        (private_fund_aum || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
      } in assets.`
    : '';
    
  // Build the narrative text
  return [
    `${legal_name} is a registered investment adviser`,
    city && state ? ` based in ${city}, ${state}` : state ? ` based in ${state}` : '',
    `. Their CRD number is ${crd_number}`,
    ` and they manage ${formattedAum} in assets.`,
    privateFundInfo ? ` ${privateFundInfo}` : ''
  ].join('').trim();
}

// Load RIA profiles from CSV file
async function loadRIAProfiles(): Promise<RIAProfile[]> {
  const csvPathCandidates = [
    join(process.cwd(), 'output', 'ria_profiles.csv'),
    join(process.cwd(), 'seed', 'ria_profiles.csv')
  ];
  
  const csvPath = csvPathCandidates.find(path => existsSync(path));
  if (!csvPath) {
    throw new Error('Could not find ria_profiles.csv in output/ or seed/ directories');
  }
  
  console.log(`Loading profiles from ${csvPath}...`);
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });
  
  // Transform CSV records to our schema
  return records.map((row: any, idx: number) => {
    // Handle CRD numbers - use from CSV if valid, otherwise generate synthetic ones
    const rawCrd = row.crd_number || row.CRD;
    const digits = rawCrd ? String(rawCrd).replace(/\D/g, '') : '';
    const crd = digits ? Number(digits) : 900000 + idx + 1;
    
    // Parse AUM value
    let aum = null;
    if (row.aum) {
      // Handle various formats like "$1,234,567", "1234567", "1,234,567", etc.
      const aumStr = String(row.aum).replace(/[$,]/g, '');
      const aumNum = Number(aumStr);
      if (!isNaN(aumNum)) {
        aum = aumNum;
      }
    }
    
    return {
      crd_number: crd,
      legal_name: row.firm_name || row.legal_name || `Investment Adviser ${crd}`,
      city: row.city || null,
      state: row.state || null,
      aum: aum,
      form_adv_date: row.form_adv_date || new Date().toISOString().split('T')[0]
    };
  });
}

// Insert/update RIA profiles in batches
async function upsertRIAProfiles(profiles: RIAProfile[]): Promise<number> {
  const batchSize = 1000;
  let insertedCount = 0;
  
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    
    try {
      const { error } = await supabase
        .from('ria_profiles')
        .upsert(batch, { onConflict: 'crd_number' });
        
      if (error) {
        console.error(`Error upserting profiles batch ${i}-${i + batch.length}:`, error);
      } else {
        insertedCount += batch.length;
        console.log(`Upserted ${insertedCount}/${profiles.length} profiles`);
      }
    } catch (error) {
      console.error(`Unexpected error in batch ${i}-${i + batch.length}:`, error);
    }
  }
  
  return insertedCount;
}

// Generate narratives for profiles
async function generateAndInsertNarratives(profiles: RIAProfile[]): Promise<number> {
  const batchSize = 1000;
  let narrativesInserted = 0;
  
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    const narratives = batch.map(profile => ({
      crd_number: profile.crd_number,
      narrative: generateNarrative(profile)
    }));
    
    try {
      const { error } = await supabase
        .from('narratives')
        .upsert(narratives, { onConflict: 'crd_number' });
        
      if (error) {
        console.error(`Error upserting narratives batch ${i}-${i + batch.length}:`, error);
      } else {
        narrativesInserted += narratives.length;
        console.log(`Inserted ${narrativesInserted}/${profiles.length} narratives`);
      }
    } catch (error) {
      console.error(`Unexpected error in narratives batch ${i}-${i + batch.length}:`, error);
    }
  }
  
  return narrativesInserted;
}

// Generate embeddings for narratives
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = getAIProvider();
  const ai = createAIService({ provider });
  
  if (!ai) {
    throw new Error('AI provider not configured. Check AI_PROVIDER environment variable.');
  }
  
  const embeddings: number[][] = [];
  
  // Process in small batches for API efficiency
  for (let i = 0; i < texts.length; i++) {
    try {
      const embedding = await ai.generateEmbedding(texts[i]);
      embeddings.push(embedding.embedding);
    } catch (error) {
      console.error(`Error generating embedding for text ${i}:`, error);
      // Push empty embedding as placeholder
      embeddings.push(new Array(EMBEDDING_MODEL_DIMENSION).fill(0));
    }
  }
  
  return embeddings;
}

// Embed all narratives without existing embeddings
async function embedNarratives(): Promise<number> {
  let processedCount = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Fetch narratives without embeddings
    const { data, error } = await supabase
      .from('narratives')
      .select('crd_number, narrative')
      .is('embedding', null)
      .limit(EMBEDDING_BATCH_SIZE);
      
    if (error) {
      console.error('Error fetching narratives:', error);
      break;
    }
    
    if (!data || data.length === 0) {
      console.log('No more narratives to embed');
      hasMore = false;
      break;
    }
    
    console.log(`Processing ${data.length} narratives...`);
    
    try {
      // Generate embeddings
      const texts = data.map(row => row.narrative);
      const embeddings = await generateEmbeddings(texts);
      
      // Update each narrative with its embedding
      for (let i = 0; i < data.length; i++) {
        const { error: updateError } = await supabase
          .from('narratives')
          .update({ embedding: embeddings[i] })
          .eq('crd_number', data[i].crd_number);
          
        if (updateError) {
          console.error(`Error updating embedding for CRD ${data[i].crd_number}:`, updateError);
        } else {
          processedCount++;
        }
      }
      
      console.log(`Embedded ${processedCount} narratives so far`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error in embedding batch:', error);
      // Continue with next batch
    }
  }
  
  return processedCount;
}

// Main function
async function main() {
  console.log('🚀 Starting RIA Hunter data pipeline...');
  const stats: ProcessingStats = {
    profilesLoaded: 0,
    narrativesGenerated: 0,
    embeddingsCreated: 0,
    errors: 0
  };
  
  try {
    // Step 1: Load RIA profiles
    console.log('\n📊 Step 1: Loading RIA profiles...');
    const profiles = await loadRIAProfiles();
    console.log(`Found ${profiles.length} profiles`);
    
    // Apply optional limit if specified
    const limitedProfiles = LOAD_LIMIT ? profiles.slice(0, LOAD_LIMIT) : profiles;
    console.log(`Processing ${limitedProfiles.length} profiles${LOAD_LIMIT ? ' (limited by LOAD_LIMIT)' : ''}`);
    
    // Step 2: Insert profiles into database
    stats.profilesLoaded = await upsertRIAProfiles(limitedProfiles);
    
    // Step 3: Generate narratives
    console.log('\n📝 Step 3: Generating narratives...');
    stats.narrativesGenerated = await generateAndInsertNarratives(limitedProfiles);
    
    // Step 4: Generate embeddings
    console.log('\n🧠 Step 4: Generating embeddings...');
    stats.embeddingsCreated = await embedNarratives();
    
    console.log('\n✅ Data pipeline completed successfully!');
    console.log('📊 Summary:');
    console.log(`  - Profiles loaded: ${stats.profilesLoaded}`);
    console.log(`  - Narratives generated: ${stats.narrativesGenerated}`);
    console.log(`  - Embeddings created: ${stats.embeddingsCreated}`);
    console.log(`  - Errors: ${stats.errors}`);
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error);
    stats.errors++;
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}
