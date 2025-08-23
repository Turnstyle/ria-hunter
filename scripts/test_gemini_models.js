/**
 * Test different Gemini model names to find working ones
 */

const { validateEnvVars } = require('./load-env');

async function testGeminiModel(modelName) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const { googleAiStudioKey } = validateEnvVars();
    
    const genAI = new GoogleGenerativeAI(googleAiStudioKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const result = await model.generateContent([
      "Hello, just respond with 'Working!'"
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    console.log(`✅ ${modelName}: ${text}`);
    return true;
    
  } catch (error) {
    console.log(`❌ ${modelName}: ${error.message}`);
    return false;
  }
}

async function testAllModels() {
  console.log('🧪 Testing different Gemini model names...\n');
  
  // Common Gemini model names for Google AI Studio
  const modelNames = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-pro',
    'gemini-pro-latest',
    'gemini-1.0-pro',
    'gemini-1.0-pro-latest',
    'models/gemini-1.5-pro-latest',
    'models/gemini-1.5-flash-latest',
    'models/gemini-pro'
  ];
  
  const workingModels = [];
  
  for (const modelName of modelNames) {
    const works = await testGeminiModel(modelName);
    if (works) {
      workingModels.push(modelName);
    }
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   - Models tested: ${modelNames.length}`);
  console.log(`   - Working models: ${workingModels.length}`);
  
  if (workingModels.length > 0) {
    console.log(`\n🎉 Working model names:`);
    workingModels.forEach(model => {
      console.log(`   ✅ ${model}`);
    });
    
    return workingModels[0]; // Return the first working model
  } else {
    console.log(`\n❌ No working models found`);
    return null;
  }
}

testAllModels().catch(console.error);
