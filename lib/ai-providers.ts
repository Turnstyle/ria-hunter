import { VertexAI } from '@google-cloud/vertexai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';

type ServiceAccountCredentials = {
  type: string;
  private_key: string;
  client_email: string;
  project_id: string;
};

export type AIProvider = 'vertex';

export interface EmbeddingResult {
  embedding: number[];
}

export interface GenerationResult {
  text: string;
}

export interface AIService {
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateText(prompt: string): Promise<GenerationResult>;
}

export class VertexAIService implements AIService {
  private vertexAI: VertexAI;
  private predictionClient: PredictionServiceClient;
  private embeddingEndpoint: string;
  private generativeModel: ReturnType<VertexAI['getGenerativeModel']>;

  constructor(projectId: string, location: string, credentials: ServiceAccountCredentials) {
    const vertexAIConfig: Record<string, unknown> = {
      project: projectId,
      location,
    };

    if (credentials) {
      vertexAIConfig.googleAuthOptions = { credentials };
    }

    this.vertexAI = new VertexAI(vertexAIConfig);

    const clientConfig: Record<string, unknown> = {};
    if (credentials) {
      clientConfig.credentials = credentials;
    }
    this.predictionClient = new PredictionServiceClient(clientConfig);

    this.embeddingEndpoint = `projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-005`;
    this.generativeModel = this.vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const instances = [helpers.toValue({
      content: text,
      task_type: 'RETRIEVAL_DOCUMENT',
    })];
    const parameters = helpers.toValue({});

    const [response] = await this.predictionClient.predict({
      endpoint: this.embeddingEndpoint,
      instances,
      parameters,
    });

    if (response.predictions && response.predictions[0]) {
      const prediction = helpers.fromValue(response.predictions[0]) as { embeddings?: { values?: number[] } };
      if (prediction?.embeddings?.values) {
        return { embedding: prediction.embeddings.values };
      }
    }

    throw new Error('Invalid embedding response structure from Vertex AI');
  }

  async generateText(prompt: string): Promise<GenerationResult> {
    const request = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const result = await this.generativeModel.generateContent(request);
    const response = result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return { text };
    }

    throw new Error('Failed to generate text from Vertex AI');
  }
}

function loadCredentials(projectId: string | undefined): ServiceAccountCredentials | null {
  if (!projectId) {
    return null;
  }

  let credentials: ServiceAccountCredentials | null = null;

  if (process.env.GCP_SA_KEY_BASE64) {
    const json = Buffer.from(process.env.GCP_SA_KEY_BASE64, 'base64').toString('utf-8');
    credentials = JSON.parse(json);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64) {
    const json = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_B64, 'base64').toString('utf-8');
    credentials = JSON.parse(json);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Lazy require to avoid bundler issues
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);

    if (!fs.existsSync(credPath)) {
      throw new Error(`Credentials file not found at ${credPath}`);
    }

    const fileContent = fs.readFileSync(credPath, 'utf-8');
    credentials = JSON.parse(fileContent);
  }

  if (!credentials) {
    return null;
  }

  const { type, private_key, client_email, project_id } = credentials;
  if (type !== 'service_account' || !private_key || !client_email || !project_id) {
    throw new Error('Invalid Vertex AI credentials provided');
  }

  return credentials;
}

export function createAIService(): AIService | null {
  const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  const credentials = loadCredentials(projectId);
  if (!projectId || !credentials) {
    console.error('Vertex AI is not configured. Ensure GOOGLE_PROJECT_ID and GCP_SA_KEY_BASE64 are set.');
    return null;
  }

  try {
    return new VertexAIService(projectId, location, credentials);
  } catch (error) {
    console.error('Failed to initialize Vertex AI', error);
    return null;
  }
}

export function getAIProvider(): AIProvider {
  return 'vertex';
}
