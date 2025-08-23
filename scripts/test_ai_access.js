/**
 * Test script to verify AI provider access
 * Tests both Vertex AI and OpenAI initialization
 */

const { validateEnvVars } = require('./load-env')

async function testVertexAI() {
  console.log('🧪 Testing Vertex AI Access...')
  
  try {
    const { VertexAI } = require('@google-cloud/vertexai')
    const { googleProjectId } = validateEnvVars()
    
    const vertexAI = new VertexAI({
      project: googleProjectId || 'ria-hunter-backend', 
      location: 'us-central1'
    })
    
    // Try multiple model variations
    const modelVariations = [
      'gemini-1.5-flash-001',
      'gemini-1.0-pro-002', 
      'gemini-pro',
      'gemini-1.5-pro-001'
    ];
    
    let workingModel = null;
    let response = null;
    
    for (const modelName of modelVariations) {
      try {
        console.log(`   🔍 Trying model: ${modelName}`);
        
        const model = vertexAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 50
          }
        });
        
        // Try a simple request
        response = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [{
              text: 'Hello, can you hear me? Just respond with "Yes, I can hear you."'
            }]
          }]
        });
        
        if (response) {
          workingModel = modelName;
          console.log(`   ✅ ${modelName} is working!`);
          break;
        }
        
      } catch (modelError) {
        console.log(`   ❌ ${modelName} failed: ${modelError.message}`);
        continue;
      }
    }
    
    if (!workingModel) {
      throw new Error('No Gemini models are accessible');
    }
    
    console.log('✅ Vertex AI Success:', response.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'Response received')
    return true
    
  } catch (error) {
    console.log('❌ Vertex AI Failed:', error.message)
    return false
  }
}

async function testOpenAI() {
  console.log('\n🧪 Testing OpenAI Access...')
  
  try {
    const OpenAI = require('openai')
    const { openaiApiKey } = validateEnvVars()
    
    if (!openaiApiKey) {
      console.log('❌ No OpenAI API key found')
      return false
    }
    
    const client = new OpenAI({ apiKey: openaiApiKey })
    
    // Test with a simple request
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: "Hello, just respond with 'OpenAI working'"
      }],
      max_tokens: 10,
      temperature: 0
    })
    
    console.log('✅ OpenAI Success:', response.choices[0]?.message?.content || 'Response received')
    return true
    
  } catch (error) {
    console.log('❌ OpenAI Failed:', error.message)
    return false
  }
}

async function main() {
  console.log('🚀 AI Provider Access Test\n')
  
  const vertexAIWorking = await testVertexAI()
  const openAIWorking = await testOpenAI()
  
  console.log('\n📊 Results:')
  console.log(`   - Vertex AI: ${vertexAIWorking ? '✅ Working' : '❌ Failed'}`)
  console.log(`   - OpenAI: ${openAIWorking ? '✅ Working' : '❌ Failed'}`)
  
  if (vertexAIWorking) {
    console.log('\n🎉 Vertex AI is ready! You can use AI_PROVIDER=vertex')
  } else if (openAIWorking) {
    console.log('\n📝 Use OpenAI fallback with AI_PROVIDER=openai')
  } else {
    console.log('\n🚨 Neither AI provider is working - check configuration')
  }
}

main().catch(console.error)
