/**
 * List available Gemini models using Google AI Studio API key
 */

const { validateEnvVars } = require('./load-env');

async function listAvailableModels() {
  console.log('🔍 Listing available Gemini models...');
  
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const { googleAiStudioKey } = validateEnvVars();
    
    if (!googleAiStudioKey) {
      throw new Error('GOOGLE_AI_STUDIO_API_KEY not found');
    }
    
    const genAI = new GoogleGenerativeAI(googleAiStudioKey);
    
    // List all available models
    const models = await genAI.listModels();
    
    console.log(`📊 Found ${models.length} available models:`);
    
    models.forEach((model, index) => {
      console.log(`   ${index + 1}. ${model.name}`);
      if (model.displayName) {
        console.log(`      Display Name: ${model.displayName}`);
      }
      if (model.description) {
        console.log(`      Description: ${model.description.substring(0, 80)}...`);
      }
      console.log(`      Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
      console.log();
    });
    
    // Find Gemini models specifically
    const geminiModels = models.filter(m => m.name.toLowerCase().includes('gemini'));
    console.log(`🎯 Gemini models found: ${geminiModels.length}`);
    geminiModels.forEach(model => {
      console.log(`   - ${model.name} (${model.displayName})`);
    });
    
    return models;
    
  } catch (error) {
    console.log('❌ Failed to list models:', error.message);
    return [];
  }
}

listAvailableModels().catch(console.error);
