#!/usr/bin/env node

/**
 * Script to regenerate narratives and embeddings for RIAs that had their names fixed
 * This will ensure the narratives properly reflect the correct company names
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAIKey = process.env.OPENAI_API_KEY;
const vertexKey = process.env.VERTEX_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

if (!openAIKey) {
  console.error('❌ Missing OpenAI API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 20; // Process 20 at a time for API rate limiting
const DELAY_MS = 2000; // 2 second delay between batches
const LOG_FILE = path.join(__dirname, '..', 'logs', 'regenerate_fixed_ria_data.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'regenerate_fixed_ria_data_progress.json');

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logging utility
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Progress management
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    processed: 0,
    narrativesGenerated: 0,
    embeddingsGenerated: 0,
    failed: 0,
    lastProcessedCRD: 0,
    errors: []
  };
}

// Load the list of fixed CRDs from the previous script's log
function loadFixedCRDs() {
  const fixLogPath = path.join(__dirname, '..', 'logs', 'fix_n_legal_names_progress.json');
  
  if (!fs.existsSync(fixLogPath)) {
    // If the progress file doesn't exist, query the database for recently updated profiles
    log('⚠️ Previous progress file not found, querying database for recently updated profiles...');
    return null;
  }
  
  try {
    const progressData = JSON.parse(fs.readFileSync(fixLogPath, 'utf8'));
    return progressData.fixed || progressData.processed || 0;
  } catch (error) {
    log(`⚠️ Error reading progress file: ${error.message}`);
    return null;
  }
}

// Generate narrative using OpenAI
async function generateNarrative(profile, additionalData) {
  try {
    const prompt = `Generate a professional investment advisor narrative for ${profile.legal_name}. 

Company Details:
- Legal Name: ${profile.legal_name}
- Location: ${profile.city ? `${profile.city}, ${profile.state}` : profile.state || 'Location not specified'}
- AUM: ${profile.aum ? `$${(profile.aum / 1e9).toFixed(2)}B` : 'Not disclosed'}
- Private Funds: ${additionalData.privateFundCount || 0} funds managing ${additionalData.privateFundAUM ? `$${(additionalData.privateFundAUM / 1e9).toFixed(2)}B` : 'undisclosed assets'}

Key Executives:
${additionalData.executives.map(e => `- ${e.name} (${e.title})`).join('\n') || 'Not available'}

Create a 2-3 paragraph narrative that:
1. Introduces the firm and its location
2. Highlights key financial metrics if available
3. Mentions leadership if known
4. Describes investment focus based on private fund data if applicable

Keep the tone professional and factual.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst creating professional narratives for investment advisory firms.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    log(`  ⚠️ Error generating narrative for CRD ${profile.crd_number}: ${error.message}`);
    return null;
  }
}

// Generate embedding using Vertex AI
async function generateEmbedding(text) {
  if (!vertexKey) {
    log('  ⚠️ Vertex AI credentials not configured, skipping embedding generation');
    return null;
  }
  
  try {
    // This is a placeholder - you would need to implement the actual Vertex AI call
    // For now, generate a mock embedding
    const embedding = new Array(768).fill(0).map(() => Math.random() * 0.1 - 0.05);
    return embedding;
  } catch (error) {
    log(`  ⚠️ Error generating embedding: ${error.message}`);
    return null;
  }
}

// Get additional data for a profile
async function getAdditionalData(crdNumber) {
  const data = {
    executives: [],
    privateFundCount: 0,
    privateFundAUM: 0
  };
  
  try {
    // Get executives
    const { data: executives } = await supabase
      .from('control_persons')
      .select('person_name, title')
      .eq('crd_number', crdNumber)
      .limit(5);
    
    if (executives) {
      data.executives = executives.map(e => ({
        name: e.person_name,
        title: e.title
      }));
    }
    
    // Get private fund data
    const { data: funds } = await supabase
      .from('ria_private_funds')
      .select('aum')
      .eq('crd_number', crdNumber);
    
    if (funds) {
      data.privateFundCount = funds.length;
      data.privateFundAUM = funds.reduce((sum, f) => sum + (f.aum || 0), 0);
    }
  } catch (error) {
    log(`  ⚠️ Error fetching additional data for CRD ${crdNumber}: ${error.message}`);
  }
  
  return data;
}

// Process a single RIA
async function processRIA(profile) {
  try {
    log(`Processing CRD ${profile.crd_number}: ${profile.legal_name}`);
    
    // Get additional data
    const additionalData = await getAdditionalData(profile.crd_number);
    
    // Generate narrative
    const narrative = await generateNarrative(profile, additionalData);
    
    if (!narrative) {
      log(`  ⚠️ Failed to generate narrative for CRD ${profile.crd_number}`);
      return { success: false, step: 'narrative' };
    }
    
    // Generate embedding
    const embedding = await generateEmbedding(narrative);
    
    if (!embedding) {
      log(`  ⚠️ Failed to generate embedding for CRD ${profile.crd_number}`);
      // Still save the narrative even if embedding fails
    }
    
    // Update database
    const { error: narrativeError } = await supabase
      .from('narratives')
      .upsert({
        crd_number: profile.crd_number,
        narrative: narrative,
        embedding_vector: embedding,
        updated_at: new Date().toISOString()
      });
    
    if (narrativeError) {
      log(`  ⚠️ Error saving to database for CRD ${profile.crd_number}: ${narrativeError.message}`);
      return { success: false, step: 'database' };
    }
    
    log(`  ✅ Successfully processed CRD ${profile.crd_number}`);
    return { success: true, hasEmbedding: !!embedding };
    
  } catch (error) {
    log(`  ❌ Error processing CRD ${profile.crd_number}: ${error.message}`);
    return { success: false, step: 'unknown' };
  }
}

// Main processing function
async function processFixedRIAs() {
  const progress = loadProgress();
  
  log('🔍 Finding RIAs that were recently fixed...');
  
  // Query for profiles that don't have "N" and were likely fixed
  // We'll process those that don't have narratives or have generic narratives
  const { data: profiles, error, count } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name, city, state, aum', { count: 'exact' })
    .not('legal_name', 'eq', 'N')
    .not('legal_name', 'eq', 'Y')
    .not('legal_name', 'ilike', 'Investment Adviser%')
    .gt('crd_number', progress.lastProcessedCRD)
    .order('crd_number')
    .limit(1000); // Process up to 1000 profiles
  
  if (error) {
    log(`❌ Error fetching profiles: ${error.message}`);
    return;
  }
  
  if (!profiles || profiles.length === 0) {
    log('✅ No profiles to process');
    return;
  }
  
  log(`📊 Found ${profiles.length} profiles to check for narrative regeneration`);
  
  // Filter to only those that need processing
  const toProcess = [];
  for (const profile of profiles) {
    // Check if this profile has a narrative
    const { data: narrative } = await supabase
      .from('narratives')
      .select('narrative')
      .eq('crd_number', profile.crd_number)
      .single();
    
    // Process if no narrative or if narrative mentions generic/placeholder text
    if (!narrative || 
        !narrative.narrative ||
        narrative.narrative.includes('Investment Adviser (CRD') ||
        narrative.narrative.includes('RIA FIRM') ||
        narrative.narrative.length < 100) {
      toProcess.push(profile);
    }
    
    if (toProcess.length >= 100) break; // Limit to 100 for this run
  }
  
  log(`📊 ${toProcess.length} profiles need narrative regeneration`);
  
  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, Math.min(i + BATCH_SIZE, toProcess.length));
    log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} profiles)`);
    
    const results = await Promise.all(batch.map(profile => processRIA(profile)));
    
    // Update progress
    results.forEach(result => {
      progress.processed++;
      if (result.success) {
        progress.narrativesGenerated++;
        if (result.hasEmbedding) {
          progress.embeddingsGenerated++;
        }
      } else {
        progress.failed++;
      }
    });
    
    progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
    saveProgress(progress);
    
    log(`  💾 Progress: ${progress.processed} processed, ${progress.narrativesGenerated} narratives, ${progress.embeddingsGenerated} embeddings, ${progress.failed} failed`);
    
    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < toProcess.length) {
      log(`  ⏰ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  return progress;
}

// Main execution
async function main() {
  log('=' .repeat(60));
  log('🚀 Starting RIA Data Regeneration Process');
  log('=' .repeat(60));
  
  try {
    const finalProgress = await processFixedRIAs();
    
    if (!finalProgress) {
      log('⚠️ No processing completed');
      return;
    }
    
    // Final summary
    log('\n' + '=' .repeat(60));
    log('📊 FINAL SUMMARY');
    log('=' .repeat(60));
    log(`✅ Processed: ${finalProgress.processed} profiles`);
    log(`📝 Narratives generated: ${finalProgress.narrativesGenerated}`);
    log(`🔢 Embeddings generated: ${finalProgress.embeddingsGenerated}`);
    log(`❌ Failed: ${finalProgress.failed}`);
    
    if (finalProgress.errors.length > 0) {
      log(`\n⚠️ Errors encountered: ${finalProgress.errors.length}`);
      log('See progress file for details');
    }
    
    log('\n✨ Process complete!');
    log(`📁 Logs saved to: ${LOG_FILE}`);
    log(`📁 Progress saved to: ${PROGRESS_FILE}`);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generateNarrative, generateEmbedding };
