/**
 * Document AI Processor
 * 
 * This module handles the integration with Google's Document AI service
 * to extract structured information from Form ADV documents.
 */

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

/**
 * Processes a document using Google Document AI
 * 
 * @param documentBuffer - Buffer containing the document to process
 * @returns Promise resolving to the extracted data
 */
export async function processDocumentWithAI(documentBuffer: Buffer): Promise<Record<string, any>> {
  try {
    // Get configuration from environment variables
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const location = process.env.DOCUMENT_AI_PROCESSOR_LOCATION || 'us';
    const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
    
    if (!projectId || !processorId) {
      throw new Error('Missing required environment variables: GOOGLE_PROJECT_ID and/or DOCUMENT_AI_PROCESSOR_ID');
    }
    
    console.log(`Processing document with Document AI (Project: ${projectId}, Processor: ${processorId})`);
    
    // Initialize the Document AI client with credentials
    const client = new DocumentProcessorServiceClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });
    
    // Format the processor name
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    
    // Create process request
    const request = {
      name,
      rawDocument: {
        content: documentBuffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    };
    
    // Process the document
    const [result] = await client.processDocument(request);
    const { document } = result;
    
    if (!document) {
      throw new Error('Document AI processing failed: No document returned');
    }
    
    console.log('Document processed successfully with Document AI');
    
    // Extract and organize form fields
    const extractedData: Record<string, any> = {};
    
    if (document.pages && document.entities) {
      // Process form fields (entities)
      document.entities.forEach((entity) => {
        if (entity.type && entity.textAnchor?.content) {
          const fieldName = entity.type.trim();
          const fieldValue = entity.textAnchor.content.trim();
          
          // Store in extracted data
          extractedData[fieldName] = fieldValue;
          
          // For debugging
          // console.log(`Field: ${fieldName} = ${fieldValue}`);
        }
      });
      
      console.log(`Extracted ${Object.keys(extractedData).length} fields from document`);
    } else {
      console.warn('No entities found in the processed document');
    }
    
    return extractedData;
  } catch (error) {
    console.error('Error processing document with Document AI:', error);
    throw error;
  }
} 