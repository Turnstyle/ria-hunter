/**
 * SEC Form ADV Fetcher
 * 
 * This module handles retrieving Form ADV documents from the SEC EDGAR database.
 */

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Fetches the latest Form ADV PDF for an adviser by CIK
 * 
 * @param cik - The Central Index Key (CIK) for the registered investment adviser
 * @returns Promise resolving to a Buffer containing the PDF document
 */
export async function fetchSecFormAdv(cik: string): Promise<Buffer> {
  try {
    // Ensure CIK is properly formatted (10 digits with leading zeros)
    const formattedCik = cik.padStart(10, '0');
    
    // API endpoint for retrieving filings
    const apiUrl = `${process.env.SEC_API_BASE_URL || 'https://www.sec.gov/'}Archives/edgar/data/${formattedCik}/index.json`;
    
    console.log(`Fetching SEC filings index from: ${apiUrl}`);
    
    // SEC requires a proper User-Agent header to prevent throttling
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'RIA-Hunter/1.0 (https://ria-hunter.com; contact@ria-hunter.com)',
        'Accept-Encoding': 'gzip, deflate',
      }
    });
    
    if (!response.ok) {
      throw new Error(`SEC API request failed with status ${response.status}: ${response.statusText}`);
    }
    
    const indexData = await response.json() as any;
    
    // Find the latest Form ADV filing (typically a '40-APP' or '40-AR' form type)
    const formAdvEntries = indexData.directory.item.filter((item: any) => 
      item.name.toLowerCase().includes('adv') || 
      item.name.toLowerCase().includes('40-app') || 
      item.name.toLowerCase().includes('40-ar')
    ).sort((a: any, b: any) => {
      // Sort by date descending
      const dateA = new Date(a.last_modified);
      const dateB = new Date(b.last_modified);
      return dateB.getTime() - dateA.getTime();
    });
    
    if (formAdvEntries.length === 0) {
      throw new Error(`No Form ADV filings found for CIK ${cik}`);
    }
    
    // Get the latest filing
    const latestFiling = formAdvEntries[0];
    const filingUrl = `${process.env.SEC_API_BASE_URL || 'https://www.sec.gov/'}Archives/edgar/data/${formattedCik}/${latestFiling.name}`;
    
    console.log(`Fetching latest Form ADV from: ${filingUrl}`);
    
    // Download the PDF file
    const pdfResponse = await fetch(filingUrl, {
      headers: {
        'User-Agent': 'RIA-Hunter/1.0 (https://ria-hunter.com; contact@ria-hunter.com)',
        'Accept-Encoding': 'gzip, deflate',
      }
    });
    
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download Form ADV PDF with status ${pdfResponse.status}: ${pdfResponse.statusText}`);
    }
    
    // Convert the response to a Buffer
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    
    // Cache the document locally (optional)
    const cacheDir = path.join(process.cwd(), 'cache', 'sec-forms');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${formattedCik}-form-adv.pdf`), pdfBuffer);
    
    return pdfBuffer;
  } catch (error) {
    console.error(`Error fetching SEC Form ADV for CIK ${cik}:`, error);
    throw error;
  }
} 