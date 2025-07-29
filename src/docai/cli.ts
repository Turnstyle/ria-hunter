#!/usr/bin/env node
/**
 * Document AI Ingestion Pipeline CLI
 * 
 * Command-line interface for running the Document AI ingestion pipeline.
 */

import { runIngestionPipeline } from './index';
import { processBatch, saveBatchResults } from './batch';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define command-line arguments
const args = process.argv.slice(2);
const command = args[0];

// Print usage information
function printUsage() {
  console.log(`
Document AI Ingestion Pipeline CLI

Usage:
  npx ts-node src/docai/cli.ts <command> [options]

Commands:
  process <cik>                Process a single CIK
  batch <path-to-file>         Process multiple CIKs from a file
  help                         Show this help message

Examples:
  npx ts-node src/docai/cli.ts process 0001234567
  npx ts-node src/docai/cli.ts batch ./cik-list.txt
  `);
}

// Process a single CIK
async function processSingle(cik: string) {
  try {
    console.log(`Processing CIK: ${cik}`);
    const result = await runIngestionPipeline(cik);
    console.log('Processing complete. Result:', {
      id: result.id,
      firm_name: result.firm_name,
      crd_number: result.crd_number,
      updated_at: result.updated_at
    });
    return 0;
  } catch (error) {
    console.error('Error processing CIK:', error);
    return 1;
  }
}

// Process a batch of CIKs from a file
async function processBatchFromFile(filePath: string) {
  try {
    // Resolve path
    const resolvedPath = path.resolve(process.cwd(), filePath);
    console.log(`Reading CIKs from: ${resolvedPath}`);
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      console.error(`File not found: ${resolvedPath}`);
      return 1;
    }
    
    // Read file content
    const content = await fs.readFile(resolvedPath, 'utf8');
    
    // Parse CIK numbers (one per line, ignoring empty lines and comments)
    const cikList = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    if (cikList.length === 0) {
      console.error('No valid CIK numbers found in the file');
      return 1;
    }
    
    console.log(`Found ${cikList.length} CIK numbers to process`);
    
    // Process the batch
    const results = await processBatch(cikList);
    
    // Save results to a log file
    await saveBatchResults(results);
    
    return results.failed.length > 0 ? 1 : 0;
  } catch (error) {
    console.error('Error processing batch:', error);
    return 1;
  }
}

// Main function
async function main() {
  if (!command || command === 'help') {
    printUsage();
    return 0;
  }
  
  switch (command) {
    case 'process':
      const cik = args[1];
      if (!cik) {
        console.error('Error: Missing CIK number');
        printUsage();
        return 1;
      }
      return await processSingle(cik);
      
    case 'batch':
      const filePath = args[1];
      if (!filePath) {
        console.error('Error: Missing file path');
        printUsage();
        return 1;
      }
      return await processBatchFromFile(filePath);
      
    default:
      console.error(`Error: Unknown command '${command}'`);
      printUsage();
      return 1;
  }
}

// Run the CLI
main()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 