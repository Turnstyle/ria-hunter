import { NextRequest, NextResponse } from 'next/server';
import { createAIService, AIConfig } from '../../../lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing Vertex AI embedding fix...');

    // Check environment variables
    const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || 'us-central1';
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (!projectId) {
      return NextResponse.json({
        success: false,
        error: 'Missing GOOGLE_PROJECT_ID or GOOGLE_CLOUD_PROJECT'
      }, { status: 500 });
    }

    if (!credentialsJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return NextResponse.json({
        success: false,
        error: 'Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON'
      }, { status: 500 });
    }

    // Test text
    const testText = "ABC Investment Advisers, LLC is a registered investment adviser based in St. Louis, Missouri (SEC Number: 12345). The firm manages $500 million in assets under management with 25 employees. They provide investment advisory services to high net worth individuals and institutional clients, specializing in equity and fixed income strategies.";

    // Create AI service
    const config: AIConfig = { provider: 'vertex' };
    const aiService = createAIService(config);
    
    if (!aiService) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create AI service via factory'
      }, { status: 500 });
    }

    console.log('✅ Factory function created service successfully');

    // Test single embedding
    console.log('🔍 Testing single embedding generation...');
    const startTime = Date.now();
    const result = await aiService.generateEmbedding(testText);
    const duration = Date.now() - startTime;
    
    if (!result.embedding || !Array.isArray(result.embedding)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid embedding result: not an array'
      }, { status: 500 });
    }
    
    if (result.embedding.length !== 768) {
      return NextResponse.json({
        success: false,
        error: `Expected 768 dimensions, got ${result.embedding.length}`
      }, { status: 500 });
    }
    
    console.log(`✅ Single embedding successful: ${result.embedding.length} dimensions`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   First few values: [${result.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    // Calculate L2 norm
    const l2Norm = Math.sqrt(result.embedding.reduce((sum, v) => sum + v * v, 0));
    console.log(`   L2 norm: ${l2Norm.toFixed(4)}`);

    return NextResponse.json({
      success: true,
      message: 'Vertex AI embedding test passed!',
      results: {
        dimensions: result.embedding.length,
        duration_ms: duration,
        l2_norm: l2Norm,
        first_values: result.embedding.slice(0, 5),
        projectId,
        location,
        model: 'textembedding-gecko@003'
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    }, { status: 500 });
  }
}
