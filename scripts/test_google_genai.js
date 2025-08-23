/**
 * Test Google Generative AI SDK (different from Vertex AI)
 * This might be the correct way to access Gemini models
 */

const { validateEnvVars } = require('./load-env');

async function testGoogleGenAI() {
  console.log('🧪 Testing Google Generative AI SDK...');
  
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const { googleAiStudioKey } = validateEnvVars();
    
    if (!googleAiStudioKey) {
      throw new Error('GOOGLE_AI_STUDIO_API_KEY not found in environment variables');
    }
    
    console.log('🔑 Using Google AI Studio API key...');
    
    // Use the Google AI Studio API key
    const genAI = new GoogleGenerativeAI(googleAiStudioKey);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent([
      "Hello, just respond with 'Google AI Studio working perfectly!'"
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Google AI Studio Success:', text);
    return true;
    
  } catch (error) {
    console.log('❌ Google AI Studio Failed:', error.message);
    return false;
  }
}

async function main() {
  const result = await testGoogleGenAI();
  console.log(`\n📊 Google GenAI Test: ${result ? '✅ Success' : '❌ Failed'}`);
}

main().catch(console.error);
