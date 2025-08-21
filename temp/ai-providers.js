"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = exports.VertexAIService = void 0;
exports.createAIService = createAIService;
exports.getAIProvider = getAIProvider;
const vertexai_1 = require("@google-cloud/vertexai");
const aiplatform_1 = require("@google-cloud/aiplatform");
const openai_1 = __importDefault(require("openai"));
// Vertex AI implementation
class VertexAIService {
    constructor(projectId, location) {
        this.vertexAI = new vertexai_1.VertexAI({
            project: projectId,
            location: location,
        });
        // Initialize prediction client for embeddings
        this.predictionClient = new aiplatform_1.PredictionServiceClient();
        this.embeddingEndpoint = `projects/${projectId}/locations/${location}/publishers/google/models/textembedding-gecko@003`;
        // Keep generative model for text generation
        this.generativeModel = this.vertexAI.preview.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
        });
    }
    async generateEmbedding(text) {
        const instances = [aiplatform_1.helpers.toValue({
                content: text,
                task_type: "RETRIEVAL_DOCUMENT"
            })];
        const parameters = aiplatform_1.helpers.toValue({});
        try {
            const [response] = await this.predictionClient.predict({
                endpoint: this.embeddingEndpoint,
                instances,
                parameters
            });
            if (response.predictions && response.predictions[0]) {
                const prediction = aiplatform_1.helpers.fromValue(response.predictions[0]);
                if (prediction.embeddings && prediction.embeddings.values) {
                    return { embedding: prediction.embeddings.values };
                }
            }
            throw new Error('Invalid embedding response structure from Vertex AI');
        }
        catch (error) {
            console.error('Vertex AI embedding error:', error);
            throw new Error(`Failed to generate embedding from Vertex AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Batch embedding method for efficiency
    async generateEmbeddings(texts) {
        const instances = texts.map(text => aiplatform_1.helpers.toValue({
            content: text,
            task_type: "RETRIEVAL_DOCUMENT"
        }));
        const parameters = aiplatform_1.helpers.toValue({});
        try {
            const [response] = await this.predictionClient.predict({
                endpoint: this.embeddingEndpoint,
                instances,
                parameters
            });
            if (response.predictions) {
                return response.predictions.map(prediction => {
                    const pred = aiplatform_1.helpers.fromValue(prediction);
                    if (pred.embeddings && pred.embeddings.values) {
                        return { embedding: pred.embeddings.values };
                    }
                    throw new Error('Invalid prediction structure in batch response');
                });
            }
            throw new Error('No predictions in batch response from Vertex AI');
        }
        catch (error) {
            console.error('Vertex AI batch embedding error:', error);
            throw new Error(`Failed to generate batch embeddings from Vertex AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateText(prompt) {
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
exports.VertexAIService = VertexAIService;
// OpenAI implementation
class OpenAIService {
    constructor(apiKey) {
        this.openai = new openai_1.default({
            apiKey: apiKey,
        });
    }
    async generateEmbedding(text) {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small', // 1536 dimensions
            input: text,
        });
        return { embedding: response.data[0].embedding };
    }
    async generateText(prompt) {
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
exports.OpenAIService = OpenAIService;
// Factory function to create AI service based on config
function createAIService(config) {
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
                    }
                    else {
                        console.error('Vertex AI: Invalid service account JSON format');
                        return null;
                    }
                }
                catch (error) {
                    console.error('Vertex AI: Failed to parse JSON credentials:', error);
                    return null;
                }
            }
            else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                console.warn('Vertex AI: Missing credentials (GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON)');
                return null;
            }
            try {
                return new VertexAIService(projectId, location);
            }
            catch (error) {
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
            }
            catch (error) {
                console.error('Failed to initialize OpenAI:', error);
                return null;
            }
        default:
            console.warn(`Unknown AI provider: ${config.provider}`);
            return null;
    }
}
// Get the current AI provider from environment or request
function getAIProvider(requestProvider) {
    // Priority order:
    // 1. Request-specific provider (future: from frontend)
    // 2. Environment variable
    // 3. Default based on what's available
    if (requestProvider) {
        return requestProvider;
    }
    const envProvider = process.env.AI_PROVIDER;
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
