#!/usr/bin/env node

/**
 * Optimized script to regenerate narratives for recently fixed RIA profiles
 * Processes in efficient batches with OpenAI API
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

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
const BATCH_SIZE = 20; // Process 20 at a time
const DELAY_MS = 2000; // 2 second delay between batches
const LOG_FILE = path.join(__dirname, '..', 'logs', 'regenerate_narratives_batch.log');
const PROGRESS_FILE = path.join(__dirname, '..', 'logs', 'regenerate_narratives_batch_progress.json');

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
    failed: 0,
    lastProcessedCRD: 0,
    errors: []
  };
}

// Generate narrative using OpenAI
async function generateNarrative(profile) {
  try {
    const prompt = `Generate a professional 2-3 paragraph investment advisor narrative for ${profile.legal_name}.

Location: ${profile.city ? `${profile.city}, ${profile.state}` : profile.state || 'Location not specified'}
AUM: ${profile.aum ? `$${(profile.aum / 1e9).toFixed(2)} billion` : 'Not disclosed'}

Create a professional narrative that introduces the firm, its location, and any available metrics. Keep the tone factual and professional.`;

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
            content: 'You are a financial analyst creating professional narratives for investment advisory firms. Be concise and factual.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    log(`  ⚠️ Error generating narrative for CRD ${profile.crd_number}: ${error.message}`);
    return null;
  }
}

// Process a batch of RIAs
async function processBatch(profiles) {
  const results = [];
  
  for (const profile of profiles) {
    log(`  Processing CRD ${profile.crd_number}: ${profile.legal_name}`);
    
    // Generate narrative
    const narrative = await generateNarrative(profile);
    
    if (!narrative) {
      log(`    ❌ Failed to generate narrative`);
      results.push({ crd: profile.crd_number, success: false });
      continue;
    }
    
    // Save to database
    const { error } = await supabase
      .from('narratives')
      .upsert({
        crd_number: profile.crd_number,
        narrative: narrative,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      log(`    ❌ Database error: ${error.message}`);
      results.push({ crd: profile.crd_number, success: false });
    } else {
      log(`    ✅ Successfully generated narrative`);
      results.push({ crd: profile.crd_number, success: true });
    }
  }
  
  return results;
}

// Main processing function
async function main() {
  log('=' .repeat(60));
  log('🚀 Starting Batch Narrative Regeneration');
  log('=' .repeat(60));
  
  const progress = loadProgress();
  
  try {
    // Get profiles that were recently fixed (those that don't have "N" as legal_name)
    // and either don't have narratives or have old/generic ones
    log('🔍 Finding profiles that need narrative regeneration...');
    
    // First, get profiles we recently fixed by reading from the fix log
    const fixLogPath = path.join(__dirname, '..', 'logs', 'fix_n_legal_names_progress.json');
    let targetCRDs = [];
    
    if (fs.existsSync(fixLogPath)) {
      const fixData = JSON.parse(fs.readFileSync(fixLogPath, 'utf8'));
      log(`📊 Found ${fixData.processed || 0} recently fixed profiles to check`);
    }
    
    // Query for profiles that were fixed (not "N", not "Y", not generic names)
    const { data: profiles, error } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .not('legal_name', 'eq', 'N')
      .not('legal_name', 'eq', 'Y')
      .not('legal_name', 'ilike', 'Investment Adviser%')
      .not('legal_name', 'ilike', 'RIA FIRM%')
      .gt('crd_number', progress.lastProcessedCRD)
      .order('crd_number')
      .limit(500); // Process 500 at a time
    
    if (error) {
      log(`❌ Error fetching profiles: ${error.message}`);
      return;
    }
    
    if (!profiles || profiles.length === 0) {
      log('✅ No more profiles to process');
      return;
    }
    
    log(`📊 Found ${profiles.length} profiles to process`);
    
    // Process in batches
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
      const batch = profiles.slice(i, Math.min(i + BATCH_SIZE, profiles.length));
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(profiles.length / BATCH_SIZE);
      
      log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} profiles)`);
      
      const results = await processBatch(batch);
      
      // Update counters
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      totalProcessed += results.length;
      totalSuccess += successCount;
      totalFailed += failCount;
      
      // Update progress
      progress.processed += results.length;
      progress.narrativesGenerated += successCount;
      progress.failed += failCount;
      progress.lastProcessedCRD = batch[batch.length - 1].crd_number;
      saveProgress(progress);
      
      log(`  ✅ Batch complete: ${successCount} succeeded, ${failCount} failed`);
      log(`  📊 Total progress: ${totalProcessed}/${profiles.length} processed`);
      
      // Delay between batches
      if (i + BATCH_SIZE < profiles.length) {
        log(`  ⏰ Waiting ${DELAY_MS / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    
    // Final summary
    log('\n' + '=' .repeat(60));
    log('📊 BATCH PROCESSING COMPLETE');
    log('=' .repeat(60));
    log(`✅ Total processed: ${totalProcessed} profiles`);
    log(`📝 Narratives generated: ${totalSuccess}`);
    log(`❌ Failed: ${totalFailed}`);
    log(`\n📊 Overall progress:`);
    log(`   Total processed (all runs): ${progress.processed}`);
    log(`   Total narratives generated: ${progress.narrativesGenerated}`);
    log(`   Total failed: ${progress.failed}`);
    
    if (profiles.length === 500) {
      log('\n💡 There may be more profiles to process. Run the script again to continue.');
    }
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
  
  log('\n✨ Process complete!');
  log(`📁 Logs saved to: ${LOG_FILE}`);
  log(`📁 Progress saved to: ${PROGRESS_FILE}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generateNarrative };
