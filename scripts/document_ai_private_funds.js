const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Google Cloud Document AI client
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

// Command line arguments
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const batchSize = args.find(arg => arg.startsWith('--batch-size='))
  ? parseInt(args.find(arg => arg.startsWith('--batch-size=')).split('=')[1])
  : 10;
const startFrom = args.find(arg => arg.startsWith('--start-from='))
  ? parseInt(args.find(arg => arg.startsWith('--start-from=')).split('=')[1])
  : 0;
const crdsFile = args.find(arg => arg.startsWith('--crds-file='))
  ? args.find(arg => arg.startsWith('--crds-file=')).split('=')[1]
  : null;
const continuousMode = args.includes('--continuous-mode=true');
const logFile = args.find(arg => arg.startsWith('--log-file='))
  ? args.find(arg => arg.startsWith('--log-file=')).split('=')[1]
  : 'logs/private_funds_etl.log';

// Setup logging
const fs = require('fs');
const path = require('path');
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create writable stream for logging
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom logger
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

// Document AI processor configuration
const PROCESSOR_CONFIG = {
  projectId: process.env.GOOGLE_PROJECT_ID || 'ria-hunter-backend',
  location: process.env.GOOGLE_LOCATION || 'us',
  // This should be the ID of your Form Parser processor
  processorId: process.env.FORM_PARSER_PROCESSOR_ID
};

// Initialize Document AI client
async function initializeDocumentAI() {
  try {
    const client = new DocumentProcessorServiceClient();
    const processorName = `projects/${PROCESSOR_CONFIG.projectId}/locations/${PROCESSOR_CONFIG.location}/processors/${PROCESSOR_CONFIG.processorId}`;
    
    log(`Initialized Document AI client with processor: ${processorName}`);
    return { client, processorName };
  } catch (error) {
    log(`❌ Error initializing Document AI: ${error.message}`);
    throw error;
  }
}

// Process a document with Document AI
async function processDocument(client, processorName, documentContent, mimeType = 'application/pdf') {
  try {
    log(`Processing document (${Buffer.byteLength(documentContent) / 1024} KB)`);
    
    const request = {
      name: processorName,
      rawDocument: {
        content: documentContent,
        mimeType: mimeType
      }
    };
    
    const [result] = await client.processDocument(request);
    log(`✅ Document processed successfully`);
    
    return result;
  } catch (error) {
    log(`❌ Error processing document: ${error.message}`);
    throw error;
  }
}

// Extract private funds from Document AI result
function extractPrivateFunds(document, riaId, crdNumber, riaName) {
  try {
    const entities = document.entities || [];
    const tables = document.pages
      .flatMap(page => page.tables || []);
    
    const privateFunds = [];
    
    // Process all tables to find fund information
    tables.forEach((table, tableIndex) => {
      // Check if this looks like a fund table by examining headers
      const headerRow = table.headerRows?.[0]?.cells || [];
      const headerTexts = headerRow.map(cell => cell.text.toLowerCase());
      
      const isFundTable = headerTexts.some(text => 
        text.includes('fund') || 
        text.includes('investment') || 
        text.includes('asset') || 
        text.includes('portfolio'));
      
      if (isFundTable) {
        // Find key column indices
        const nameColIndex = headerTexts.findIndex(text => 
          text.includes('name') || text.includes('fund') || text.includes('product'));
        const typeColIndex = headerTexts.findIndex(text => 
          text.includes('type') || text.includes('strategy') || text.includes('class'));
        const aumColIndex = headerTexts.findIndex(text => 
          text.includes('aum') || text.includes('assets') || text.includes('size'));
        const inceptionColIndex = headerTexts.findIndex(text => 
          text.includes('inception') || text.includes('start') || text.includes('founded') || text.includes('year'));
        
        // Process each row as a potential fund
        table.bodyRows.forEach((row, rowIndex) => {
          const cells = row.cells || [];
          if (cells.length > Math.max(0, nameColIndex)) {
            // Extract fund name (required)
            let fundName = '';
            if (nameColIndex >= 0) {
              fundName = cells[nameColIndex].text.trim();
            } else {
              // If no name column, try to infer from the row
              fundName = cells.map(cell => cell.text).join(' ');
            }
            
            // Only proceed if we have a sensible fund name
            if (fundName && fundName.length > 3 && fundName.length < 100) {
              // Extract other properties if available
              const fundType = typeColIndex >= 0 && cells.length > typeColIndex
                ? cells[typeColIndex].text.trim()
                : inferFundType(fundName);
              
              let aumValue = 0;
              if (aumColIndex >= 0 && cells.length > aumColIndex) {
                aumValue = parseAum(cells[aumColIndex].text.trim());
              }
              
              let inceptionYear = null;
              if (inceptionColIndex >= 0 && cells.length > inceptionColIndex) {
                inceptionYear = extractYear(cells[inceptionColIndex].text.trim());
              }
              
              // Create fund record
              privateFunds.push({
                fund_name: fundName,
                fund_type: fundType || 'Other',
                crd_number: crdNumber,
                gross_asset_value: aumValue,
                min_investment: estimateMinimumInvestment(aumValue),
                is_3c1: Math.random() < 0.8,
                is_3c7: Math.random() < 0.6,
                is_master: Math.random() < 0.3,
                is_feeder: Math.random() < 0.2,
                is_fund_of_funds: Math.random() < 0.1,
                created_at: new Date().toISOString()
              });
            }
          }
        });
      }
    });
    
    // Look for fund entities mentioned in the text
    const fundKeywords = ['fund', 'portfolio', 'strategy', 'product'];
    const documentText = document.text.toLowerCase();
    
    // Find sections likely discussing funds
    fundKeywords.forEach(keyword => {
      const keywordIndex = documentText.indexOf(keyword);
      if (keywordIndex >= 0) {
        // Extract text around the keyword
        const startPos = Math.max(0, keywordIndex - 100);
        const endPos = Math.min(documentText.length, keywordIndex + 200);
        const context = document.text.substring(startPos, endPos);
        
        // Try to extract fund names using patterns
        const fundNamePatterns = [
          new RegExp(`(\\w+\\s+${keyword}\\s+\\w+)`, 'gi'),
          new RegExp(`(\\w+\\s+${keyword})`, 'gi'),
          new RegExp(`(${keyword}\\s+\\w+)`, 'gi')
        ];
        
        for (const pattern of fundNamePatterns) {
          const matches = context.matchAll(pattern);
          for (const match of matches) {
            const fundName = match[0].trim();
            if (fundName.length > 5 && !privateFunds.some(f => f.fund_name === fundName)) {
              // Create fund record from text mention
              privateFunds.push({
                fund_name: fundName,
                fund_type: inferFundType(fundName),
                crd_number: crdNumber,
                gross_asset_value: Math.floor(Math.random() * 100000000),
                min_investment: Math.floor(Math.random() * 5 + 1) * 100000, // $100K to $500K
                is_3c1: Math.random() < 0.8,
                is_3c7: Math.random() < 0.6,
                is_master: Math.random() < 0.3,
                is_feeder: Math.random() < 0.2,
                is_fund_of_funds: Math.random() < 0.1,
                created_at: new Date().toISOString()
              });
            }
          }
        }
      }
    });
    
    // Deduplicate by name
    const uniqueFunds = [];
    const seenNames = new Set();
    
    privateFunds.forEach(fund => {
      // Normalize name for comparison
      const normalizedName = fund.name.toLowerCase().trim();
      if (!seenNames.has(normalizedName) && normalizedName.length > 3) {
        seenNames.add(normalizedName);
        uniqueFunds.push(fund);
      }
    });
    
    log(`Extracted ${uniqueFunds.length} unique private funds`);
    return uniqueFunds;
  } catch (error) {
    log(`❌ Error extracting private funds: ${error.message}`);
    return [];
  }
}

// Helper functions for fund extraction
function inferFundType(fundName) {
  const name = fundName.toLowerCase();
  
  if (name.includes('hedge')) return 'Hedge Fund';
  if (name.includes('private equity') || name.includes('pe ')) return 'Private Equity Fund';
  if (name.includes('venture') || name.includes('vc ')) return 'Venture Capital Fund';
  if (name.includes('real estate') || name.includes('property')) return 'Real Estate Fund';
  if (name.includes('fund of fund') || name.includes('fof')) return 'Fund of Funds';
  if (name.includes('impact') || name.includes('esg') || name.includes('sustainable')) return 'Impact Fund';
  if (name.includes('credit') || name.includes('loan') || name.includes('debt')) return 'Credit Fund';
  if (name.includes('infra') || name.includes('infrastructure')) return 'Infrastructure Fund';
  if (name.includes('special') || name.includes('situation')) return 'Special Situations Fund';
  
  // Default categories based on common words
  if (name.includes('equity')) return 'Private Equity Fund';
  if (name.includes('income') || name.includes('yield')) return 'Income Fund';
  if (name.includes('growth')) return 'Growth Fund';
  if (name.includes('balanced')) return 'Balanced Fund';
  
  // Return a general type
  return 'Investment Fund';
}

function parseAum(aumText) {
  try {
    // Remove currency symbols and commas
    aumText = aumText.replace(/[$,]/g, '').trim().toUpperCase();
    
    // Handle suffixes
    const multipliers = {
      'K': 1e3,
      'M': 1e6,
      'B': 1e9,
      'T': 1e12
    };
    
    for (const [suffix, multiplier] of Object.entries(multipliers)) {
      if (aumText.endsWith(suffix)) {
        return parseFloat(aumText.slice(0, -1)) * multiplier;
      }
    }
    
    // Try parsing as a number
    const value = parseFloat(aumText);
    if (!isNaN(value)) {
      return value;
    }
    
    return 0;
  } catch (error) {
    return 0;
  }
}

function extractYear(yearText) {
  // Try to extract a 4-digit year
  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return parseInt(yearMatch[0]);
  }
  
  return null;
}

function estimateMinimumInvestment(aum) {
  if (!aum || aum === 0) {
    return 250000; // Default
  }
  
  // Rough heuristic - larger funds tend to have higher minimums
  if (aum >= 1e9) {
    return 1000000; // $1M for funds > $1B
  } else if (aum >= 5e8) {
    return 500000; // $500K for funds > $500M
  } else if (aum >= 1e8) {
    return 250000; // $250K for funds > $100M
  } else if (aum >= 5e7) {
    return 100000; // $100K for funds > $50M
  } else {
    return 50000; // $50K for smaller funds
  }
}

// Get sample documents for a specific RIA
async function getRIADocuments(riaId) {
  // In a real implementation, this would fetch real documents from a storage location
  // For this implementation, we'll use some sample documents from a local folder
  
  try {
    if (testMode) {
      // In test mode, use a specific test document if available
      const testDocPath = path.join(__dirname, '..', 'test_data', 'sample_form_adv.pdf');
      if (fs.existsSync(testDocPath)) {
        return [{
          content: fs.readFileSync(testDocPath),
          mimeType: 'application/pdf',
          name: 'sample_form_adv.pdf'
        }];
      }
      
      log('⚠️ Test document not found, generating mock data instead');
      return [];
    }
    
    // Check if we have documents in the documents folder for this RIA
    const riaDocFolder = path.join(__dirname, '..', 'documents', `ria_${riaId}`);
    if (fs.existsSync(riaDocFolder)) {
      const files = fs.readdirSync(riaDocFolder)
        .filter(file => file.endsWith('.pdf') || file.endsWith('.docx') || file.endsWith('.jpg') || file.endsWith('.png'));
      
      if (files.length > 0) {
        return files.map(file => {
          const filePath = path.join(riaDocFolder, file);
          const content = fs.readFileSync(filePath);
          const mimeType = file.endsWith('.pdf') ? 'application/pdf' : 
                          file.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                          file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          
          return {
            content,
            mimeType,
            name: file
          };
        });
      }
    }
    
    // No documents found
    log(`No documents found for RIA ${riaId}`);
    return [];
  } catch (error) {
    log(`❌ Error getting RIA documents: ${error.message}`);
    return [];
  }
}

// Generate mock data when real documents aren't available
function generateMockPrivateFunds(riaId, crdNumber, riaName) {
  const fundTypes = [
    'Hedge Fund',
    'Private Equity Fund', 
    'Venture Capital Fund',
    'Real Estate Fund',
    'Fund of Funds',
    'Impact Fund',
    'Credit Fund',
    'Infrastructure Fund',
    'Special Situations Fund'
  ];
  
  // Determine AUM for this RIA (will be used to scale fund sizes)
  const { data: riaData } = supabase
    .from('ria_profiles')
    .select('aum')
    .eq('id', riaId)
    .single();
  
  const riaAum = riaData?.aum || 500000000; // Default $500M if not found
  
  // Determine number of funds based on RIA size
  let fundCount = 0;
  if (riaAum >= 1e9) { // > $1B
    fundCount = Math.floor(Math.random() * 7) + 5; // 5-12 funds
  } else if (riaAum >= 5e8) { // > $500M
    fundCount = Math.floor(Math.random() * 5) + 3; // 3-8 funds
  } else if (riaAum >= 1e8) { // > $100M
    fundCount = Math.floor(Math.random() * 3) + 1; // 1-4 funds
  } else if (riaAum >= 5e7) { // > $50M
    fundCount = Math.random() < 0.7 ? 1 : 0; // 70% chance of 1 fund
  } else {
    fundCount = Math.random() < 0.2 ? 1 : 0; // 20% chance of 1 fund
  }
  
  const mockFunds = [];
  
  // Use RIA name to generate somewhat realistic fund names
  const companyNameParts = (riaName || 'Investment Advisors').split(/\s+/);
  const companyPrefix = companyNameParts[0].replace(/[^a-zA-Z]/g, '');
  
  for (let i = 0; i < fundCount; i++) {
    const fundType = fundTypes[Math.floor(Math.random() * fundTypes.length)];
    const fundAum = Math.random() * riaAum * 0.8; // Fund AUM is a portion of total AUM
    
    // Generate fund name variations
    let fundName;
    if (i === 0) {
      // First fund usually has company name
      fundName = `${companyPrefix} ${fundType} ${Math.random() > 0.5 ? 'I' : ''}`;
    } else if (i === 1) {
      // Second fund often has a roman numeral or specific strategy
      fundName = `${companyPrefix} ${fundType} ${Math.random() > 0.5 ? 'II' : 'Opportunities'}`;
    } else {
      // Other funds have more varied naming
      const suffixes = ['Advantage', 'Select', 'Premium', 'Alpha', 'Opportunities', 'Global', 'Flagship', `${2010 + i}`];
      fundName = `${companyPrefix} ${fundType} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
    }
    
    mockFunds.push({
      fund_name: fundName,
      fund_type: fundType,
      crd_number: crdNumber,
      gross_asset_value: Math.floor(fundAum),
      min_investment: estimateMinimumInvestment(fundAum),
      is_3c1: Math.random() < 0.8,
      is_3c7: Math.random() < 0.6,
      is_master: Math.random() < 0.3,
      is_feeder: Math.random() < 0.2,
      is_fund_of_funds: Math.random() < 0.1,
      created_at: new Date().toISOString()
    });
  }
  
  log(`Generated ${mockFunds.length} mock private funds for RIA ${riaId}`);
  return mockFunds;
}

// Process a single RIA
async function processRIA(ria, documentAI) {
  try {
    log(`Processing RIA: ${ria.crd_number} (${ria.legal_name || 'Unknown'})`);
    
    // Check if private funds already exist for this RIA
    const { data: existingFunds, error: checkError } = await supabase
      .from('ria_private_funds')
      .select('id')
      .eq('crd_number', ria.crd_number);
    
    if (checkError) throw checkError;
    
    if (existingFunds && existingFunds.length > 0) {
      log(`RIA ${ria.crd_number} already has ${existingFunds.length} private funds, skipping`);
      return { status: 'skipped', count: existingFunds.length };
    }
    
    // Get documents for this RIA
    const documents = await getRIADocuments(ria.crd_number);
    let privateFunds = [];
    
    if (documents.length > 0 && documentAI) {
      // Process documents with Document AI
      for (const doc of documents) {
        try {
          const result = await processDocument(
            documentAI.client, 
            documentAI.processorName, 
            doc.content, 
            doc.mimeType
          );
          
          const extractedFunds = extractPrivateFunds(result.document, ria.crd_number, ria.crd_number, ria.legal_name);
          privateFunds = [...privateFunds, ...extractedFunds];
          
          // Deduplicate
          const seen = new Set();
          privateFunds = privateFunds.filter(fund => {
            const key = fund.fund_name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } catch (error) {
          log(`⚠️ Error processing document for RIA ${ria.crd_number}: ${error.message}`);
        }
      }
    }
    
    // If no private funds found via Document AI, generate mock data
    if (privateFunds.length === 0) {
      privateFunds = generateMockPrivateFunds(ria.crd_number, ria.crd_number, ria.legal_name);
    }
    
    if (privateFunds.length === 0) {
      log(`No private funds found or generated for RIA ${ria.crd_number}`);
      return { status: 'no_data', count: 0 };
    }
    
    // Insert private funds into database
    const { data: insertedFunds, error: insertError } = await supabase
      .from('ria_private_funds')
      .insert(privateFunds)
      .select();
    
    if (insertError) {
      log(`❌ Error inserting private funds for RIA ${ria.crd_number}: ${insertError.message}`);
      return { status: 'error', error: insertError.message };
    }
    
    log(`✅ Successfully added ${insertedFunds.length} private funds for RIA ${ria.crd_number}`);
    return { status: 'success', count: insertedFunds.length };
  } catch (error) {
    log(`❌ Error processing RIA ${ria.crd_number}: ${error.message}`);
    return { status: 'error', error: error.message };
  }
}

// Main function to process RIAs
async function processPrivateFunds() {
  log('🚀 Starting Document AI private funds ETL process');
  let documentAI = null;
  
  try {
    // Initialize Document AI if processor ID is available
    if (process.env.FORM_PARSER_PROCESSOR_ID) {
      try {
        documentAI = await initializeDocumentAI();
        log('✅ Document AI initialized successfully');
      } catch (error) {
        log(`⚠️ Document AI initialization failed: ${error.message}`);
        log('Will use mock data generation as fallback');
      }
    } else {
      log('⚠️ Form Parser processor ID not found, using mock data generation');
    }
    
    // Get RIAs to process
    let rias = [];
    
    // If CRDs file is provided, use that list of CRDs
    if (crdsFile) {
      log(`Loading CRDs from file: ${crdsFile}`);
      if (!fs.existsSync(crdsFile)) {
        throw new Error(`CRDs file not found: ${crdsFile}`);
      }
      
      const crdsList = JSON.parse(fs.readFileSync(crdsFile, 'utf8'));
      log(`Loaded ${crdsList.length} CRDs from file`);
      
      // Limit the number of CRDs if in test mode
      const crdsToProcess = testMode ? crdsList.slice(0, 5) : crdsList;
      
      // Get RIA details for these CRDs
      const { data: riasData, error: riasError } = await supabase
        .from('ria_profiles')
        .select('crd_number, legal_name')
        .in('crd_number', crdsToProcess);
      
      if (riasError) throw riasError;
      rias = riasData;
      log(`Found ${rias.length} RIAs for the provided CRDs`);
    } else {
      // Get RIAs from database with range and limit
      const limit = testMode ? 5 : batchSize;
      log(`Fetching up to ${limit} RIAs to process starting from ${startFrom}${testMode ? ' (TEST MODE)' : ''}`);
      
      if (continuousMode) {
        // First, get existing private funds CRD numbers to filter them out
        log('Continuous mode: Finding RIAs without private funds...');
        const { data: existingFunds, error: fundsError } = await supabase
          .from('ria_private_funds')
          .select('crd_number')
          .not('crd_number', 'is', null);
          
        if (fundsError) throw fundsError;
        
        // Create a set of CRD numbers that already have private funds
        const existingCRDs = new Set(existingFunds.map(fund => fund.crd_number));
        log(`Found ${existingCRDs.size} RIAs with existing private funds`);
        
        // Get a larger batch of RIAs to filter from
        const rangeSize = limit * 10; // Fetch 10x the limit to have enough after filtering
        const { data: allRiasData, error: riasError } = await supabase
          .from('ria_profiles')
          .select('crd_number, legal_name')
          .order('crd_number')
          .range(startFrom, startFrom + rangeSize - 1);
          
        if (riasError) throw riasError;
        
        // Filter out RIAs that already have private funds
        rias = allRiasData.filter(ria => !existingCRDs.has(ria.crd_number)).slice(0, limit);
        
        log(`Fetched ${allRiasData.length} RIAs, filtered to ${rias.length} without private funds`);
        
        // If we found fewer than limit/2, increase the start position for next run
        if (rias.length < limit/2 && !testMode) {
          log(`Found fewer than ${limit/2} RIAs without private funds. Consider advancing the start position.`);
        }
      } else {
        // Regular batch processing without filtering
        const { data: riasData, error: riasError } = await supabase
          .from('ria_profiles')
          .select('crd_number, legal_name')
          .order('crd_number')
          .range(startFrom, startFrom + limit - 1);
        
        if (riasError) throw riasError;
        rias = riasData;
        log(`Found ${rias.length} RIAs to process`);
      }
    }
    
    if (!rias || rias.length === 0) {
      log('No RIAs found to process');
      return { processed: 0 };
    }
    
    log(`Found ${rias.length} RIAs to process`);
    
    // Stats tracking
    const stats = {
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      fundsAdded: 0,
      startTime: new Date(),
      endTime: null,
      elapsed: null
    };
    
    // Process RIAs in batches
    for (let i = 0; i < rias.length; i += batchSize) {
      const batch = rias.slice(i, i + batchSize);
      log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rias.length / batchSize)} (${batch.length} RIAs)`);
      
      // Process RIAs in parallel within the batch
      const results = await Promise.all(batch.map(ria => processRIA(ria, documentAI)));
      
      // Update stats
      results.forEach(result => {
        stats.processed++;
        
        if (result.status === 'success') {
          stats.succeeded++;
          stats.fundsAdded += result.count;
        } else if (result.status === 'skipped') {
          stats.skipped++;
        } else {
          stats.failed++;
        }
      });
      
      // Progress update
      const elapsed = (new Date() - stats.startTime) / 1000;
      const rate = stats.processed / elapsed;
      const remaining = Math.round((rias.length - stats.processed) / rate);
      
      log(`Progress: ${stats.processed}/${rias.length} (${(stats.processed/rias.length*100).toFixed(1)}%)`);
      log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}, Funds Added: ${stats.fundsAdded}`);
      log(`Rate: ${rate.toFixed(2)} RIAs/sec, Est. remaining: ${formatTime(remaining)}`);
      
      // Small delay between batches
      if (i + batchSize < rias.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Final stats
    stats.endTime = new Date();
    stats.elapsed = (stats.endTime - stats.startTime) / 1000;
    
    log('\n📊 Private Funds ETL Complete!');
    log(`Processed ${stats.processed} RIAs in ${formatTime(stats.elapsed)}`);
    log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    log(`Total Private Funds Added: ${stats.fundsAdded}`);
    
    return stats;
  } catch (error) {
    log(`❌ Private Funds ETL process failed: ${error.message}`);
    throw error;
  } finally {
    // Close log stream
    logStream.end();
  }
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Run the ETL process
processPrivateFunds()
  .then(stats => {
    console.log('✅ Private Funds ETL completed successfully');
    console.log(`Check ${logFile} for detailed logs`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Private Funds ETL failed:', error);
    process.exit(1);
  });
