/**
 * Batch Processing Utility
 * 
 * This module provides utilities to process multiple SEC Form ADV files
 * in a batch operation, with error handling and reporting.
 */

import { runIngestionPipeline } from './index';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface BatchResult {
  successful: string[];
  failed: Array<{ cik: string; error: string }>;
  totalProcessed: number;
  successRate: number;
}

/**
 * Process a batch of CIK numbers
 * 
 * @param cikList - Array of CIK numbers to process
 * @returns Promise resolving to batch processing results
 */
export async function processBatch(cikList: string[]): Promise<BatchResult> {
  console.log(`Starting batch processing for ${cikList.length} CIK numbers`);
  
  const results: BatchResult = {
    successful: [],
    failed: [],
    totalProcessed: 0,
    successRate: 0
  };
  
  // Process each CIK sequentially to avoid rate limiting issues
  for (const cik of cikList) {
    try {
      console.log(`\n--- Processing CIK: ${cik} (${results.totalProcessed + 1}/${cikList.length}) ---`);
      
      // Run the ingestion pipeline for this CIK
      await runIngestionPipeline(cik);
      
      // Record success
      results.successful.push(cik);
      console.log(`✓ Successfully processed CIK: ${cik}`);
    } catch (error) {
      // Record failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.failed.push({ cik, error: errorMessage });
      console.error(`✗ Failed to process CIK: ${cik} - ${errorMessage}`);
    }
    
    results.totalProcessed++;
  }
  
  // Calculate success rate
  results.successRate = results.successful.length / results.totalProcessed;
  
  // Log summary
  console.log('\n--- Batch Processing Summary ---');
  console.log(`Total Processed: ${results.totalProcessed}`);
  console.log(`Successful: ${results.successful.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Success Rate: ${(results.successRate * 100).toFixed(2)}%`);
  
  return results;
}

/**
 * Save batch processing results to a log file
 * 
 * @param results - Batch processing results to log
 * @returns Promise resolving to the path of the saved log file
 */
export async function saveBatchResults(results: BatchResult): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(process.cwd(), 'logs');
  await fs.mkdir(logDir, { recursive: true });
  
  const logPath = path.join(logDir, `batch-results-${timestamp}.json`);
  await fs.writeFile(logPath, JSON.stringify(results, null, 2));
  
  console.log(`Batch results saved to: ${logPath}`);
  return logPath;
}

// CLI support for direct invocation
if (require.main === module) {
  // Check for input file with list of CIKs
  const inputFile = process.argv[2];
  
  if (!inputFile) {
    console.error('Please provide a path to a file containing CIK numbers (one per line)');
    process.exit(1);
  }
  
  // Read and process the CIK list
  fs.readFile(inputFile, 'utf8')
    .then(content => {
      // Parse CIK numbers from file (one per line, ignoring empty lines and comments)
      const cikList = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      return processBatch(cikList);
    })
    .then(results => saveBatchResults(results))
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Batch processing failed:', error);
      process.exit(1);
    });
} 