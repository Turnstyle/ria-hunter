import { VertexAI } from '@google-cloud/vertexai';
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
  private embeddingModel: any;
  private generativeModel: any;

  constructor(projectId: string, location: string) {
    this.vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });
    
    // Initialize models
    this.embeddingModel = this.vertexAI.preview.getGenerativeModel({
      model: 'textembedding-gecko@003',
    });
    
    this.generativeModel = this.vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const request = {
      instances: [{ content: text }],
    };
    
    const result = await this.embeddingModel.predict(request);
    if (result.predictions && result.predictions[0]) {
      return { embedding: result.predictions[0].embeddings.values };
    }
    
    throw new Error('Failed to generate embedding from Vertex AI');
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
      const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
      
      if (!projectId) {
        console.warn('Vertex AI: Missing Google Cloud project ID');
        return null;
      }

      // Check for JSON credentials in environment variable (for Vercel deployment)
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (credentialsJson) {
        try {
          // Parse and validate JSON credentials
          const credentials = JSON.parse(credentialsJson);
          if (credentials.type === 'service_account' && credentials.private_key && credentials.client_email) {
            // Set credentials for Google Auth Library
            process.env.GOOGLE_APPLICATION_CREDENTIALS = JSON.stringify(credentials);
            console.log('Vertex AI: Using JSON credentials from environment variable');
          } else {
            console.error('Vertex AI: Invalid service account JSON format');
            return null;
          }
        } catch (error) {
          console.error('Vertex AI: Failed to parse JSON credentials:', error);
          return null;
        }
      } else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn('Vertex AI: Missing credentials (GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON)');
        return null;
      }
      
      try {
        return new VertexAIService(projectId, location);
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
  
  const envProvider = process.env.AI_PROVIDER as AIProvider;
  if (envProvider && ['vertex', 'openai'].includes(envProvider)) {
    return envProvider;
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