/**
 * AI Service Resilience Layer
 * Based on Gemini Technical Specification Document Section 4.2
 * 
 * Implements circuit breaker pattern and graceful degradation
 * for AI service calls to prevent cascading failures
 */

import CircuitBreaker from 'opossum';
import { AIService, EmbeddingResult, GenerationResult } from './ai-providers';

// Circuit breaker configuration as per Gemini spec section 4.2.1
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 2500, // 2.5 seconds timeout
  errorThresholdPercentage: 25, // Open circuit if 25% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  volumeThreshold: 10, // Minimum 10 requests before calculating error percentage
  rollingCountTimeout: 10000, // 10 second rolling window
  name: 'vertex-ai-circuit'
};

export interface ResilientAIService extends AIService {
  getCircuitState(): string;
  getStats(): any;
}

/**
 * Wraps an AI service with circuit breaker and fallback logic
 * This ensures system resilience when AI services are unavailable
 */
export class ResilientAIServiceWrapper implements ResilientAIService {
  private embeddingBreaker: CircuitBreaker;
  private generationBreaker: CircuitBreaker;
  
  constructor(private aiService: AIService, private fallbackService?: AIService) {
    // Create circuit breaker for embedding generation
    this.embeddingBreaker = new CircuitBreaker(
      (text: string) => this.aiService.generateEmbedding(text),
      CIRCUIT_BREAKER_OPTIONS
    );
    
    // Create circuit breaker for text generation
    this.generationBreaker = new CircuitBreaker(
      (prompt: string) => this.aiService.generateText(prompt),
      CIRCUIT_BREAKER_OPTIONS
    );
    
    // Set up event handlers for monitoring
    this.setupEventHandlers();
    
    // Set up fallback functions
    this.setupFallbacks();
  }
  
  private setupEventHandlers() {
    // Log when circuit opens (service is failing)
    this.embeddingBreaker.on('open', () => {
      console.error('🔴 CIRCUIT OPEN: Embedding service is failing');
      // TODO: Send alert to monitoring system
    });
    
    this.generationBreaker.on('open', () => {
      console.error('🔴 CIRCUIT OPEN: Text generation service is failing');
      // TODO: Send alert to monitoring system
    });
    
    // Log when circuit closes (service recovered)
    this.embeddingBreaker.on('halfOpen', () => {
      console.warn('🟡 CIRCUIT HALF-OPEN: Testing embedding service recovery');
    });
    
    this.generationBreaker.on('halfOpen', () => {
      console.warn('🟡 CIRCUIT HALF-OPEN: Testing generation service recovery');
    });
    
    // Log successful recovery
    this.embeddingBreaker.on('close', () => {
      console.log('🟢 CIRCUIT CLOSED: Embedding service recovered');
    });
    
    this.generationBreaker.on('close', () => {
      console.log('🟢 CIRCUIT CLOSED: Generation service recovered');
    });
    
    // Log failures for debugging
    this.embeddingBreaker.on('failure', (error) => {
      console.error('Embedding generation failed:', error.message || error);
    });
    
    this.generationBreaker.on('failure', (error) => {
      console.error('Text generation failed:', error.message || error);
    });
  }
  
  private setupFallbacks() {
    // Fallback for embedding generation
    this.embeddingBreaker.fallback(async (text: string) => {
      console.warn('⚠️ Using fallback for embedding generation');
      
      // If we have a fallback service (e.g., OpenAI), try it
      if (this.fallbackService) {
        try {
          console.log('Attempting fallback service for embedding...');
          return await this.fallbackService.generateEmbedding(text);
        } catch (error) {
          console.error('Fallback service also failed:', error);
        }
      }
      
      // Ultimate fallback: return a dummy embedding
      // This allows the system to continue functioning
      console.warn('Returning dummy embedding for resilience');
      return {
        embedding: new Array(768).fill(0) // 768-dimensional zero vector
      } as EmbeddingResult;
    });
    
    // Fallback for text generation
    this.generationBreaker.fallback(async (prompt: string) => {
      console.warn('⚠️ Using fallback for text generation');
      
      // If we have a fallback service, try it
      if (this.fallbackService) {
        try {
          console.log('Attempting fallback service for text generation...');
          return await this.fallbackService.generateText(prompt);
        } catch (error) {
          console.error('Fallback service also failed:', error);
        }
      }
      
      // Ultimate fallback: return a generic message
      console.warn('Returning fallback message for resilience');
      return {
        text: 'I apologize, but I am temporarily unable to generate a detailed response. The search results above contain the information you requested.'
      } as GenerationResult;
    });
  }
  
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      // Circuit breaker will handle timeouts, failures, and fallbacks
      return await this.embeddingBreaker.fire(text);
    } catch (error) {
      // This should rarely happen as fallback should catch most cases
      console.error('Critical embedding error bypassed circuit breaker:', error);
      throw error;
    }
  }
  
  async generateText(prompt: string): Promise<GenerationResult> {
    try {
      // Circuit breaker will handle timeouts, failures, and fallbacks
      return await this.generationBreaker.fire(prompt);
    } catch (error) {
      // This should rarely happen as fallback should catch most cases
      console.error('Critical generation error bypassed circuit breaker:', error);
      throw error;
    }
  }
  
  /**
   * Get the current state of the circuit breakers
   * Useful for health checks and monitoring
   */
  getCircuitState(): string {
    const embeddingState = this.embeddingBreaker.opened ? 'OPEN' : 
                          this.embeddingBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED';
    const generationState = this.generationBreaker.opened ? 'OPEN' : 
                           this.generationBreaker.halfOpen ? 'HALF_OPEN' : 'CLOSED';
    
    return `Embedding: ${embeddingState}, Generation: ${generationState}`;
  }
  
  /**
   * Get detailed statistics about circuit breaker performance
   */
  getStats(): any {
    return {
      embedding: this.embeddingBreaker.stats,
      generation: this.generationBreaker.stats,
      state: this.getCircuitState()
    };
  }
}

/**
 * Factory function to create a resilient AI service
 * This is the main entry point for the application
 */
export function createResilientAIService(
  primaryService: AIService | null,
  fallbackService?: AIService | null
): ResilientAIService | null {
  if (!primaryService) {
    if (fallbackService) {
      console.warn('Primary AI service unavailable, using fallback service directly');
      return new ResilientAIServiceWrapper(fallbackService);
    }
    console.error('No AI service available (neither primary nor fallback)');
    return null;
  }
  
  return new ResilientAIServiceWrapper(
    primaryService,
    fallbackService || undefined
  );
}

/**
 * Health check function for monitoring
 * Can be exposed via an API endpoint for health monitoring systems
 */
export async function checkAIServiceHealth(service: ResilientAIService): Promise<{
  healthy: boolean;
  state: string;
  stats: any;
}> {
  const stats = service.getStats();
  const state = service.getCircuitState();
  
  // Consider service unhealthy if any circuit is open
  const healthy = !state.includes('OPEN');
  
  return {
    healthy,
    state,
    stats
  };
}
