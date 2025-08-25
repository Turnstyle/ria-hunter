const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

// Get batch number from command line arguments
const args = process.argv.slice(2);
const batchArg = args.find(arg => arg.startsWith('--batch='));
const batchNumber = batchArg ? parseInt(batchArg.split('=')[1]) : 1;

// Get max records to process (optional)
const maxArg = args.find(arg => arg.startsWith('--max='));
const maxRecords = maxArg ? parseInt(maxArg.split('=')[1]) : Infinity;

// Get test mode flag (processes only a few records for testing)
const testMode = args.includes('--test');

// Get AI provider from environment or command line
const aiProviderArg = args.find(arg => arg.startsWith('--provider='));
const AI_PROVIDER = aiProviderArg 
  ? aiProviderArg.split('=')[1] 
  : process.env.AI_PROVIDER || 'vertex';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize generative AI models based on provider
let genAI, vertexAI, openAIClient;
if (AI_PROVIDER === 'google') {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_API_KEY);
} else if (AI_PROVIDER === 'vertex') {
  vertexAI = new VertexAI({
    project: process.env.GOOGLE_PROJECT_ID || 'ria-hunter-backend',
    location: process.env.GOOGLE_LOCATION || 'us-central1'
  });
} else if (AI_PROVIDER === 'openai') {
  openAIClient = new OpenAIClient(
    process.env.OPENAI_API_ENDPOINT || "https://api.openai.com/v1",
    new AzureKeyCredential(process.env.OPENAI_API_KEY)
  );
}

// Helper to generate embeddings using Google AI
async function generateEmbedding(text) {
  try {
    // If Google AI Studio is initialized, use it for embeddings
    if (genAI) {
      // Use Google's text-embedding model
      const embeddingModel = genAI.getGenerativeModel({ 
        model: "embedding-001" // Google's text embedding model (768 dimensions)
      });
      
      // Generate embedding
      const result = await embeddingModel.embedContent(text);
      const embedding = result.embedding.values;
      
      return embedding;
    } 
    // Fallback to Vertex AI embeddings if Google AI Studio not available
    else if (vertexAI) {
      const embeddingModel = vertexAI.getGenerativeModel({
        model: "textembedding-gecko@latest"
      });
      
      const result = await embeddingModel.embedContent({
        content: { text: text }
      });
      
      return result.embedding;
    }
    // Emergency fallback to OpenAI if neither Google option is available
    else if (process.env.OPENAI_API_KEY) {
      console.log('⚠️ Falling back to OpenAI for embeddings as no Google embedding model is available');
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          input: text,
          model: "text-embedding-3-small", // 768 dimensions
          encoding_format: "float"
        })
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`OpenAI API error: ${data.error.message}`);
      }
      
      return data.data[0].embedding;
    } else {
      throw new Error('No embedding models available. Please configure Google AI Studio, Vertex AI, or OpenAI.');
    }
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Generate narrative using Google AI Studio (Gemini)
async function generateNarrativeWithGoogleAI(riaInfo) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash" 
    });
    
    const prompt = `Generate a comprehensive narrative summary for the following Registered Investment Advisor (RIA):
    
Name: ${riaInfo.legal_name || 'Unknown'}
Location: ${riaInfo.city || 'Unknown'}, ${riaInfo.state || 'Unknown'}
Assets Under Management: ${formatAUM(riaInfo.aum) || 'Unknown'}

Your task is to create a detailed, professional 3-paragraph narrative that would be useful for investors and financial professionals. 
The narrative should include:
- A professional summary of the firm
- Their likely investment approach based on their profile
- Potential advantages of working with a firm of this size and location

Generate factual, professional content in a formal tone suitable for a financial platform.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return text;
  } catch (error) {
    console.error('Error generating narrative with Google AI:', error);
    throw error;
  }
}

// Generate narrative using Vertex AI (Gemini)
async function generateNarrativeWithVertexAI(riaInfo) {
  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generation_config: {
        max_output_tokens: 800,
        temperature: 0.2,
        top_p: 0.8,
        top_k: 40
      },
    });
    
    const prompt = `Generate a comprehensive narrative summary for the following Registered Investment Advisor (RIA):
    
Name: ${riaInfo.legal_name || 'Unknown'}
Location: ${riaInfo.city || 'Unknown'}, ${riaInfo.state || 'Unknown'}
Assets Under Management: ${formatAUM(riaInfo.aum) || 'Unknown'}

Your task is to create a detailed, professional 3-paragraph narrative that would be useful for investors and financial professionals. 
The narrative should include:
- A professional summary of the firm
- Their likely investment approach based on their profile
- Potential advantages of working with a firm of this size and location

Generate factual, professional content in a formal tone suitable for a financial platform.`;

    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating narrative with Vertex AI:', error);
    // Try fallback to Google AI Studio if this was a Vertex AI error
    if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
      console.log('Falling back to Google AI Studio...');
      genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_API_KEY);
      return generateNarrativeWithGoogleAI(riaInfo);
    }
    throw error;
  }
}

// Generate narrative using OpenAI
async function generateNarrativeWithOpenAI(riaInfo) {
  try {
    const response = await openAIClient.getChatCompletions(
      process.env.OPENAI_MODEL || "gpt-3.5-turbo",
      [
        { role: "system", content: "You are a financial analyst specializing in investment advisors." },
        { role: "user", content: `Generate a comprehensive narrative summary for the following Registered Investment Advisor (RIA):
    
Name: ${riaInfo.legal_name || 'Unknown'}
Location: ${riaInfo.city || 'Unknown'}, ${riaInfo.state || 'Unknown'}
Assets Under Management: ${formatAUM(riaInfo.aum) || 'Unknown'}

Your task is to create a detailed, professional 3-paragraph narrative that would be useful for investors and financial professionals. 
The narrative should include:
- A professional summary of the firm
- Their likely investment approach based on their profile
- Potential advantages of working with a firm of this size and location

Generate factual, professional content in a formal tone suitable for a financial platform.` }
      ],
      { temperature: 0.2, maxTokens: 800 }
    );
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating narrative with OpenAI:', error);
    throw error;
  }
}

// Format AUM for display
function formatAUM(aum) {
  if (!aum) return 'Unknown';
  
  aum = parseFloat(aum);
  
  if (aum >= 1e9) {
    return `$${(aum / 1e9).toFixed(1)} billion`;
  } else if (aum >= 1e6) {
    return `$${(aum / 1e6).toFixed(1)} million`;
  } else {
    return `$${aum.toLocaleString()}`;
  }
}

// Process a single RIA
async function processRIA(crdNumber) {
  try {
    // Check if narrative already exists for this CRD
    const { data: existingNarrative, error: existingError } = await supabase
      .from('narratives')
      .select('id')
      .eq('crd_number', crdNumber)
      .limit(1);
    
    if (existingError) throw existingError;
    
    if (existingNarrative && existingNarrative.length > 0) {
      console.log(`⚠️ CRD ${crdNumber} already has a narrative, skipping`);
      return { status: 'skipped', reason: 'already_exists' };
    }
    
    // Get RIA profile data
    const { data: riaProfile, error: riaError } = await supabase
      .from('ria_profiles')
      .select('*')
      .eq('crd_number', crdNumber)
      .limit(1);
    
    if (riaError) throw riaError;
    
    if (!riaProfile || riaProfile.length === 0) {
      console.log(`⚠️ No RIA profile found for CRD ${crdNumber}, skipping`);
      return { status: 'skipped', reason: 'no_profile' };
    }
    
    const riaInfo = riaProfile[0];
    
    // Generate narrative based on provider
    let narrative;
    if (AI_PROVIDER === 'google') {
      narrative = await generateNarrativeWithGoogleAI(riaInfo);
    } else if (AI_PROVIDER === 'vertex') {
      narrative = await generateNarrativeWithVertexAI(riaInfo);
    } else if (AI_PROVIDER === 'openai') {
      narrative = await generateNarrativeWithOpenAI(riaInfo);
    } else {
      throw new Error(`Unknown AI provider: ${AI_PROVIDER}`);
    }
    
    // Generate embedding
    const embedding = await generateEmbedding(narrative);
    
    // Insert into narratives table
    const { data: insertedNarrative, error: insertError } = await supabase
      .from('narratives')
      .insert([
        {
          crd_number: crdNumber,
          narrative_text: narrative,
          narrative_type: 'general',
          embedding: JSON.stringify(embedding),
          embedding_vector: embedding,
          embedding_generated_at: new Date().toISOString(),
          embedding_model: 'text-embedding-3-small',
          embedding_dimensions: 768
        }
      ])
      .select();
    
    if (insertError) {
      console.error(`Error inserting narrative for CRD ${crdNumber}:`, insertError);
      return { status: 'failed', error: insertError };
    }
    
    console.log(`✅ Successfully generated and stored narrative for CRD ${crdNumber}`);
    return { status: 'success', narrative_id: insertedNarrative[0].id };
  } catch (error) {
    console.error(`❌ Error processing CRD ${crdNumber}:`, error);
    return { status: 'failed', error: error.message };
  }
}

// Main function to process a batch of RIAs
async function processBatch() {
  console.log(`🚀 Starting targeted narrative generation for batch ${batchNumber}`);
  console.log(`Using AI provider: ${AI_PROVIDER}`);
  
  try {
    // Load the batch file
    const batchFile = `missing_narratives_batch_${batchNumber}.json`;
    if (!fs.existsSync(batchFile)) {
      console.error(`❌ Batch file ${batchFile} not found. Run identify_missing_narratives.js first.`);
      process.exit(1);
    }
    
    const crdNumbers = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    console.log(`Found ${crdNumbers.length} CRDs to process in batch ${batchNumber}`);
    
    // Limit for test mode
    const crdsToProcess = testMode ? crdNumbers.slice(0, 5) : crdNumbers.slice(0, maxRecords);
    console.log(`Will process ${crdsToProcess.length} CRDs ${testMode ? '(TEST MODE)' : ''}`);
    
    // Process results and stats
    const results = {
      total: crdsToProcess.length,
      success: 0,
      failed: 0,
      skipped: 0,
      startTime: new Date(),
      endTime: null,
      errors: []
    };
    
    // Process each CRD with rate limiting
    for (let i = 0; i < crdsToProcess.length; i++) {
      const crdNumber = crdsToProcess[i];
      console.log(`Processing ${i+1}/${crdsToProcess.length}: CRD ${crdNumber}`);
      
      const result = await processRIA(crdNumber);
      
      if (result.status === 'success') {
        results.success++;
      } else if (result.status === 'failed') {
        results.failed++;
        results.errors.push({ crd: crdNumber, error: result.error });
      } else if (result.status === 'skipped') {
        results.skipped++;
      }
      
      // Progress update every 10 records
      if ((i + 1) % 10 === 0 || i === crdsToProcess.length - 1) {
        const elapsed = (new Date() - results.startTime) / 1000;
        const rate = (i + 1) / elapsed;
        const remaining = Math.round((crdsToProcess.length - i - 1) / rate);
        
        console.log(`Progress: ${i+1}/${crdsToProcess.length} (${Math.round((i+1)/crdsToProcess.length*100)}%)`);
        console.log(`Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
        console.log(`Rate: ${rate.toFixed(2)} records/sec, Est. remaining time: ${formatTime(remaining)}`);
      }
      
      // Rate limiting to avoid API throttling
      if (i < crdsToProcess.length - 1) {
        const delay = AI_PROVIDER === 'openai' ? 1000 : 500; // Slower for OpenAI to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Finalize results
    results.endTime = new Date();
    const totalTime = (results.endTime - results.startTime) / 1000;
    
    console.log('\n📊 Processing completed!');
    console.log(`Total time: ${formatTime(totalTime)}`);
    console.log(`Total processed: ${results.total}`);
    console.log(`Success: ${results.success} (${Math.round(results.success/results.total*100)}%)`);
    console.log(`Failed: ${results.failed} (${Math.round(results.failed/results.total*100)}%)`);
    console.log(`Skipped: ${results.skipped} (${Math.round(results.skipped/results.total*100)}%)`);
    
    if (results.errors.length > 0) {
      fs.writeFileSync(
        `batch_${batchNumber}_errors.json`, 
        JSON.stringify(results.errors, null, 2)
      );
      console.log(`Errors written to batch_${batchNumber}_errors.json`);
    }
    
    // Write full results to file
    fs.writeFileSync(
      `batch_${batchNumber}_results.json`, 
      JSON.stringify(results, null, 2)
    );
    console.log(`Full results written to batch_${batchNumber}_results.json`);
    
    return results;
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    process.exit(1);
  }
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Run the process
processBatch()
  .then(() => {
    console.log('✅ Batch processing completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Batch processing failed:', error);
    process.exit(1);
  });
