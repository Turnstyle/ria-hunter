// Test the current Vertex AI implementation to see embedding dimensions
const fs = require('fs');

// Load environment variables
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].trim();
  }
});

// Set environment variables
Object.keys(envVars).forEach(key => {
  process.env[key] = envVars[key];
});

const { createAIService } = require('./lib/ai-providers.ts');

async function testVertexEmbedding() {
  console.log('🧪 Testing current Vertex AI embedding implementation');
  console.log('='.repeat(60));
  
  try {
    console.log('Environment check:');
    console.log('✅ AI_PROVIDER:', process.env.AI_PROVIDER);
    console.log('✅ GOOGLE_PROJECT_ID:', process.env.GOOGLE_PROJECT_ID);
    console.log('✅ GOOGLE_APPLICATION_CREDENTIALS_JSON:', process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? 'Set' : 'Missing');
    
    const aiService = createAIService({ provider: 'vertex' });
    
    if (!aiService) {
      console.log('❌ Failed to create Vertex AI service');
      return;
    }
    
    console.log('\n🚀 Testing embedding generation...');
    
    const testText = "EXAMPLE INVESTMENT ADVISERS LLC is a registered investment adviser based in NEW YORK, NY. CRD number: 12345. Manages $1.2 billion in assets with 15 employees. Offers investment advisory services to high net worth individuals and institutional clients.";
    
    console.log(`📝 Test text: "${testText.substring(0, 100)}..."`);
    
    const startTime = Date.now();
    const result = await aiService.generateEmbedding(testText);
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Embedding generated successfully in ${duration}ms`);
    console.log(`📐 Embedding dimension: ${result.embedding.length}`);
    console.log(`📊 First 3 values: [${result.embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`📊 Last 3 values: [${result.embedding.slice(-3).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`📊 Value type: ${typeof result.embedding[0]}`);
    console.log(`📊 All values are numbers: ${result.embedding.every(v => typeof v === 'number')}`);
    
    // Verify dimension matches what we expect
    if (result.embedding.length === 768) {
      console.log('\n🎯 Perfect! Embedding is 768 dimensions (matches vector(768) schema)');
    } else if (result.embedding.length === 384) {
      console.log('\n⚠️  Warning: Embedding is 384 dimensions (textembedding-gecko@003 format)');
      console.log('    Schema expects vector(768). Need to either:');
      console.log('    1. Change model to produce 768 dimensions, or');
      console.log('    2. Update schema to vector(384)');
    } else {
      console.log(`\n❓ Unexpected dimension: ${result.embedding.length}`);
    }

    // Test batch embedding too
    console.log('\n🧪 Testing batch embedding...');
    const batchTexts = [
      "First test narrative about investment advisory services.",
      "Second test narrative about wealth management."
    ];
    
    const batchStartTime = Date.now();
    const batchResults = await aiService.generateEmbeddings(batchTexts);
    const batchDuration = Date.now() - batchStartTime;
    
    console.log(`✅ Batch embedding completed in ${batchDuration}ms`);
    console.log(`📊 Generated ${batchResults.length} embeddings`);
    console.log(`📐 All embeddings same dimension: ${batchResults.every(r => r.embedding.length === result.embedding.length)}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
  
  console.log('='.repeat(60));
  console.log('🏁 Vertex AI embedding test complete');
}

testVertexEmbedding();
