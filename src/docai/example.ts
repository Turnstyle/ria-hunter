/**
 * Document AI Ingestion Pipeline Example
 * 
 * This script demonstrates how to use the Document AI ingestion pipeline
 * to process SEC Form ADV documents.
 */

import { runIngestionPipeline } from './index';
import { processBatch } from './batch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Example 1: Process a single CIK
 */
async function processSingleExample(cik: string) {
  console.log(`\n=== Example 1: Processing Single CIK ${cik} ===\n`);
  try {
    const result = await runIngestionPipeline(cik);
    console.log('Success! Processed RIA profile:', {
      id: result.id,
      firm_name: result.firm_name,
      crd_number: result.crd_number,
      updated_at: result.updated_at
    });
  } catch (error) {
    console.error('Error processing single CIK:', error);
  }
}

/**
 * Example 2: Process a batch of CIKs
 */
async function processBatchExample(cikList: string[]) {
  console.log(`\n=== Example 2: Processing Batch of ${cikList.length} CIKs ===\n`);
  try {
    const results = await processBatch(cikList);
    console.log('Batch processing results:', {
      successful: results.successful.length,
      failed: results.failed.length,
      successRate: `${(results.successRate * 100).toFixed(2)}%`
    });
  } catch (error) {
    console.error('Error processing batch:', error);
  }
}

/**
 * Main function to run the examples
 */
async function runExamples() {
  // Example CIKs for demonstration
  // Note: Replace with real CIKs for actual testing
  const sampleCik = '0001111111'; // Replace with a real CIK
  const sampleBatch = [
    '0001111111', // Replace with real CIKs
    '0002222222',
    '0003333333'
  ];
  
  // Run examples
  await processSingleExample(sampleCik);
  await processBatchExample(sampleBatch);
}

// Run the examples if this script is executed directly
if (require.main === module) {
  console.log('Running Document AI ingestion pipeline examples...');
  runExamples()
    .then(() => {
      console.log('\nExamples completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nExample execution failed:', error);
      process.exit(1);
    });
} 