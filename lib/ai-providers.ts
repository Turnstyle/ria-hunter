import { VertexAI } from '@google-cloud/vertexai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import OpenAI from 'openai';

export type AIProvider = 'vertex' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  // Future: could add model selection, temperature, etc.
}

export interface EmbeddingResult {
  embedding: number[];
}

export interface GenerationResult {
  text: string;
}

// Abstract interface for AI operations
export interface AIService {
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateText(prompt: string): Promise<GenerationResult>;
}

// Vertex AI implementation
export class VertexAIService implements AIService {
  private vertexAI: VertexAI;
  private predictionClient: PredictionServiceClient;
  private embeddingEndpoint: string;
  private generativeModel: ReturnType<VertexAI['getGenerativeModel']>;

  constructor(projectId: string, location: string, credentials?: any) {
    // Use explicit credentials if provided, otherwise fall back to ADC
    const vertexAIConfig: any = {
      project: projectId,
      location: location,
    };
    
    if (credentials) {
      vertexAIConfig.googleAuthOptions = { credentials };
    }
    
    this.vertexAI = new VertexAI(vertexAIConfig);
    
    // Initialize prediction client for embeddings with same credentials
    const clientConfig: any = {};
    if (credentials) {
      clientConfig.credentials = credentials;
    }
    this.predictionClient = new PredictionServiceClient(clientConfig);
    
    // Use text-embedding-005 (768 dimensions) as per Gemini spec section 3.2.4
    this.embeddingEndpoint = `projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005`;
    
    // Use Gemini 2.0 Flash as per Gemini spec section 4.1
    this.generativeModel = this.vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const instances = [helpers.toValue({
      content: text,
      task_type: "RETRIEVAL_DOCUMENT"
    })];
    const parameters = helpers.toValue({});
    
    try {
      const [response] = await this.predictionClient.predict({
        endpoint: this.embeddingEndpoint,
        instances,
        parameters
      });
      
      if (response.predictions && response.predictions[0]) {
        const prediction = helpers.fromValue(response.predictions[0]) as any;
        if (prediction && typeof prediction === 'object' && prediction.embeddings && prediction.embeddings.values) {
          return { embedding: prediction.embeddings.values };
        }
      }
      
      throw new Error('Invalid embedding response structure from Vertex AI');
    } catch (error) {
      console.error('Vertex AI embedding error:', error);
      throw new Error(`Failed to generate embedding from Vertex AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Batch embedding method for efficiency
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const instances = texts.map(text => helpers.toValue({
      content: text,
      task_type: "RETRIEVAL_DOCUMENT"
    }));
    const parameters = helpers.toValue({});
    
    try {
      const [response] = await this.predictionClient.predict({
        endpoint: this.embeddingEndpoint,
        instances,
        parameters
      });
      
      if (response.predictions) {
        return response.predictions.map(prediction => {
          const pred = helpers.fromValue(prediction) as any;
          if (pred && typeof pred === 'object' && pred.embeddings && pred.embeddings.values) {
            return { embedding: pred.embeddings.values };
          }
          throw new Error('Invalid prediction structure in batch response');
        });
      }
      
      throw new Error('No predictions in batch response from Vertex AI');
    } catch (error) {
      console.error('Vertex AI batch embedding error:', error);
      throw new Error(`Failed to generate batch embeddings from Vertex AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateText(prompt: string): Promise<GenerationResult> {
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    
    const result = await this.generativeModel.generateContent(request);
    const response = result.response;
    
    if (response.candidates && response.candidates[0].content.parts[0].text) {
      return { text: response.candidates[0].content.parts[0].text };
    }
    
    throw new Error('Failed to generate text from Vertex AI');
  }
}

// OpenAI implementation
export class OpenAIService implements AIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small', // 1536 dimensions
      input: text,
    });
    
    return { embedding: response.data[0].embedding };
  }

  async generateText(prompt: string): Promise<GenerationResult> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that answers questions about Registered Investment Advisers (RIAs) based on provided data. Return only what is asked. For JSON tasks, output only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 800,
    });
    
    const text = response.choices[0]?.message?.content || '';
    
    return { text };
  }
}

// Factory function to create AI service based on config
export function createAIService(config: AIConfig): AIService | null {
  switch (config.provider) {
    case 'vertex':
      const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
      // Use specific Vertex AI location from env or default to us-central1
      const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
      
      if (!projectId) {
        console.warn('Vertex AI: Missing Google Cloud project ID');
        return null;
      }

      // Get credentials using the approach from Gemini spec section 2.1.3
      let credentials: any = null;
      
      // Priority 1: Base64 encoded credentials (recommended for Vercel per Gemini spec)
      if (process.env.GCP_SA_KEY_BASE64) {
        try {
          console.log('🔑 Vertex AI: Using Base64 encoded service account (Gemini spec 2.1.3)');
          const credentialsJson = Buffer.from(
            process.env.GCP_SA_KEY_BASE64,
            'base64'
          ).toString('utf-8');
          credentials = JSON.parse(credentialsJson);
          console.log('✅ Successfully decoded Base64 credentials');
        } catch (error) {
          console.error('Vertex AI: Failed to decode Base64 credentials:', error);
          return null;
        }
      }
      // Priority 2: Legacy base64 format for backward compatibility
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64) {
        try {
          console.log('🔑 Vertex AI: Using legacy base64 encoded credentials');
          credentials = JSON.parse(
            Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_B64, 'base64').toString('utf-8')
          );
        } catch (error) {
          console.error('Vertex AI: Failed to parse legacy base64 credentials:', error);
          return null;
        }
      }
      // Priority 3: JSON string credentials (not recommended)
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        try {
          console.log('⚠️  Vertex AI: Using JSON string credentials (migrate to Base64)');
          credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        } catch (error) {
          console.error('Vertex AI: Failed to parse JSON credentials:', error);
          return null;
        }
      }
      // Priority 4: File path (for local development only)
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          console.log('📁 Vertex AI: Reading credentials from file (local dev only):', process.env.GOOGLE_APPLICATION_CREDENTIALS);
          const fs = require('fs');
          const path = require('path');
          
          // Resolve the path (could be relative or absolute)
          const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
          
          if (fs.existsSync(credPath)) {
            const fileContent = fs.readFileSync(credPath, 'utf-8');
            credentials = JSON.parse(fileContent);
            console.log('✅ Successfully loaded credentials from file');
          } else {
            console.error('Vertex AI: Credentials file not found at:', credPath);
            return null;
          }
        } catch (error) {
          console.error('Vertex AI: Failed to read credentials from file:', error);
          return null;
        }
      }
      
      // Validate credentials structure as per Gemini spec
      if (credentials) {
        if (!credentials.type || credentials.type !== 'service_account') {
          console.error('Vertex AI: Invalid credential type, must be "service_account"');
          return null;
        }
        if (!credentials.private_key || !credentials.client_email || !credentials.project_id) {
          console.error('Vertex AI: Missing required fields in service account JSON');
          return null;
        }
        console.log(`✅ Valid service account: ${credentials.client_email}`);
      } else {
        console.error('Vertex AI: No credentials found. Please set GCP_SA_KEY_BASE64');
        return null;
      }
      
      try {
        return new VertexAIService(projectId, location, credentials);
      } catch (error) {
        console.error('Failed to initialize Vertex AI:', error);
        return null;
      }
      
    case 'openai':
      const apiKey = process.env.OPENAI_API_KEY;
      console.log(`OpenAI API key present: ${!!apiKey}, length: ${apiKey?.length || 0}`);
      
      if (!apiKey) {
        console.warn('OpenAI: Missing API key');
        return null;
      }
      
      try {
        return new OpenAIService(apiKey);
      } catch (error) {
        console.error('Failed to initialize OpenAI:', error);
        return null;
      }
      
    default:
      console.warn(`Unknown AI provider: ${config.provider}`);
      return null;
  }
}

// Get the current AI provider from environment or request
export function getAIProvider(requestProvider?: AIProvider): AIProvider {
  // Priority order:
  // 1. Request-specific provider (future: from frontend)
  // 2. Environment variable
  // 3. Default based on what's available
  
  if (requestProvider) {
    return requestProvider;
  }
  
  const envProvider = process.env.AI_PROVIDER;
  // Map 'google' to 'vertex' for backward compatibility
  if (envProvider === 'google') {
    return 'vertex';
  }
  if (envProvider && ['vertex', 'openai'].includes(envProvider)) {
    return envProvider as AIProvider;
  }
  
  // Default logic: prefer OpenAI for production stability, fall back to Vertex
  const hasOpenAIConfig = !!process.env.OPENAI_API_KEY;
  const hasVertexConfig = !!(process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);

  if (hasOpenAIConfig) {
    return 'openai';
  }
  if (hasVertexConfig) {
    return 'vertex';
  }

  // Default to OpenAI if nothing is configured
  return 'openai';
}