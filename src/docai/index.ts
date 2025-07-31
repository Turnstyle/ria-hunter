/**
 * Document AI Ingestion Pipeline
 * 
 * Main entry point for the SEC Form ADV ingestion pipeline.
 * This module coordinates the following steps:
 * 1. Fetch SEC Form ADV files
 * 2. Process documents with Google Vertex Document AI
 * 3. Normalize extracted fields
 * 4. Upsert data to Supabase
 */

import { fetchSecFormAdv } from './fetcher';
import { processDocumentWithAI } from './processor';
import { normalizeFields } from './normalizer';
import { upsertToSupabase } from './storage';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Run the complete ingestion pipeline for a given CIK number
 * 
 * @param cik - The Central Index Key (CIK) of the adviser to process
 * @returns Promise resolving to the processed and stored RIA profile
 */
export async function runIngestionPipeline(cik: string) {
  try {
    console.log(`Starting ingestion pipeline for CIK: ${cik}`);
    
    // Step 1: Fetch SEC Form ADV document
    const documentBuffer = await fetchSecFormAdv(cik);
    
    // Step 2: Process document with Google Document AI
    const extractedData = await processDocumentWithAI(documentBuffer);
    
    // Step 3: Normalize fields according to our schema
    const normalizedData = normalizeFields(extractedData);
    
    // Step 4: Upsert to Supabase
    const result = await upsertToSupabase(normalizedData);
    
    console.log(`Completed ingestion pipeline for CIK: ${cik}`);
    return result;
  } catch (error) {
    console.error(`Error in ingestion pipeline for CIK ${cik}:`, error);
    throw error;
  }
}

// CLI support for direct invocation
if (require.main === module) {
  const cik = process.argv[2];
  if (!cik) {
    console.error('Please provide a CIK number as a command line argument');
    process.exit(1);
  }
  
  runIngestionPipeline(cik)
    .then(result => {
      console.log('Pipeline completed successfully:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Pipeline failed:', error);
      process.exit(1);
    });
} 