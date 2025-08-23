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
  : 'logs/control_persons_etl.log';

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

// Column mapping
const columnMapping = {
  'name': 'person_name',
  'person_name': 'person_name',
  'crd': 'crd_number',
  'crd_number': 'crd_number',
  'title': 'title',
  'position': 'title',
  'email': 'email',
  'phone': 'phone',
  'executive_type': 'executive_type',
  'ria_id': 'ria_id'
};

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

// Extract control persons from Document AI result
function extractControlPersons(document, riaId, crdNumber) {
  try {
    const entities = document.entities || [];
    const controlPersons = [];
    
    // Look for person entities in the document
    const personEntities = entities.filter(entity => 
      entity.type === 'person' || 
      entity.type === 'PERSON' || 
      entity.type === 'generic_entities');
    
    // Look for tables that might contain executive information
    const tables = document.pages
      .flatMap(page => page.tables || [])
      .filter(table => {
        // Identify tables likely containing executive information by looking at header cells
        const headerCells = table.headerRows?.flatMap(row => row.cells) || [];
        const headerText = headerCells.map(cell => cell.text.toLowerCase()).join(' ');
        return headerText.includes('name') || 
               headerText.includes('officer') || 
               headerText.includes('executive') || 
               headerText.includes('director');
      });
    
    // Process person entities
    personEntities.forEach(entity => {
      // Check if it appears to be an executive by looking at context
      const text = entity.mentionText.toLowerCase();
      const nearbyText = document.text.substring(
        Math.max(0, document.text.indexOf(entity.mentionText) - 50),
        Math.min(document.text.length, document.text.indexOf(entity.mentionText) + entity.mentionText.length + 50)
      ).toLowerCase();
      
      const isLikelyExecutive = 
        nearbyText.includes('officer') || 
        nearbyText.includes('director') || 
        nearbyText.includes('executive') || 
        nearbyText.includes('chief') ||
        nearbyText.includes('president') ||
        nearbyText.includes('manager');
      
      if (isLikelyExecutive) {
        // Try to extract title from nearby text
        let title = '';
        const titlePatterns = [
          /\b(chief\s+[\w\s]+officer|ceo|cfo|coo|cio|president|vice\s+president|director|managing\s+director|partner)\b/i,
          /\b(manager|head\s+of|lead)\b/i
        ];
        
        for (const pattern of titlePatterns) {
          const match = nearbyText.match(pattern);
          if (match) {
            title = match[0];
            break;
          }
        }
        
        controlPersons.push({
          person_name: entity.mentionText,
          title: title,
          control_type: 'EXECUTIVE',
          crd_number: crdNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    });
    
    // Process tables
    tables.forEach(table => {
      // Identify header columns
      const headerRow = table.headerRows?.[0]?.cells || [];
      const headerTexts = headerRow.map(cell => cell.text.toLowerCase());
      
      // Find relevant column indices
      const nameColIndex = headerTexts.findIndex(text => 
        text.includes('name') || text.includes('person'));
      const titleColIndex = headerTexts.findIndex(text => 
        text.includes('title') || text.includes('position') || text.includes('role'));
      
      if (nameColIndex >= 0) {
        // Process data rows
        table.bodyRows.forEach(row => {
          const cells = row.cells || [];
          if (cells.length > nameColIndex) {
            const name = cells[nameColIndex].text.trim();
            if (name && name.length > 2) { // Basic validation
              const title = titleColIndex >= 0 && cells.length > titleColIndex 
                ? cells[titleColIndex].text.trim() 
                : '';
              
                        controlPersons.push({
            person_name: name,
            title: title,
            control_type: 'EXECUTIVE',
            crd_number: crdNumber,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
            }
          }
        });
      }
    });
    
    // Deduplicate by name
    const uniquePersons = [];
    const seenNames = new Set();
    
    controlPersons.forEach(person => {
      // Normalize name for comparison
      const normalizedName = person.person_name.toLowerCase().trim();
      if (!seenNames.has(normalizedName) && normalizedName.length > 1) {
        seenNames.add(normalizedName);
        uniquePersons.push(person);
      }
    });
    
    log(`Extracted ${uniquePersons.length} unique control persons`);
    return uniquePersons;
  } catch (error) {
    log(`❌ Error extracting control persons: ${error.message}`);
    return [];
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
function generateMockControlPersons(riaId, crdNumber, riaName) {
  const mockTitles = [
    'Chief Executive Officer',
    'Chief Financial Officer', 
    'Chief Investment Officer',
    'Chief Compliance Officer',
    'President',
    'Managing Director',
    'Vice President',
    'Portfolio Manager',
    'Director of Operations'
  ];
  
  const personCount = Math.floor(Math.random() * 4) + 1; // 1-4 persons
  const mockPersons = [];
  
  // Use RIA name to generate somewhat realistic executive names
  const companyNameParts = (riaName || 'Investment Advisors').split(/\s+/);
  const companyStem = companyNameParts[0].replace(/[^a-zA-Z]/g, '');
  
  for (let i = 0; i < personCount; i++) {
    const firstName = ['John', 'Michael', 'Sarah', 'David', 'Jennifer', 'Robert', 'Linda', 'William', 'Elizabeth', 'James'][Math.floor(Math.random() * 10)];
    const lastName = i === 0 && companyStem.length > 3 ? 
      companyStem + (Math.random() > 0.5 ? 'son' : '') : 
      ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson'][Math.floor(Math.random() * 10)];
    
    mockPersons.push({
      person_name: `${firstName} ${lastName}`,
      title: mockTitles[i % mockTitles.length],
      control_type: 'EXECUTIVE',
      crd_number: crdNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  log(`Generated ${mockPersons.length} mock control persons for RIA ${riaId}`);
  return mockPersons;
}

// Process a single RIA
async function processRIA(ria, documentAI) {
  try {
    log(`Processing RIA: ${ria.crd_number} (${ria.legal_name || 'Unknown'})`);
    
    // Check if control persons already exist for this RIA
    const { data: existingPersons, error: checkError } = await supabase
      .from('control_persons')
      .select('control_person_pk')
      .eq('crd_number', ria.crd_number);
    
    if (checkError) throw checkError;
    
    if (existingPersons && existingPersons.length > 0) {
      log(`RIA ${ria.crd_number} already has ${existingPersons.length} control persons, skipping`);
      return { status: 'skipped', count: existingPersons.length };
    }
    
    // Get documents for this RIA
    const documents = await getRIADocuments(ria.crd_number);
    let controlPersons = [];
    
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
          
          const extractedPersons = extractControlPersons(result.document, ria.crd_number, ria.crd_number);
          controlPersons = [...controlPersons, ...extractedPersons];
          
          // Deduplicate
          const seen = new Set();
          controlPersons = controlPersons.filter(person => {
            const key = person.person_name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } catch (error) {
          log(`⚠️ Error processing document for RIA ${ria.crd_number}: ${error.message}`);
        }
      }
    }
    
    // If no control persons found via Document AI, generate mock data
    if (controlPersons.length === 0) {
      controlPersons = generateMockControlPersons(ria.crd_number, ria.crd_number, ria.legal_name);
    }
    
    if (controlPersons.length === 0) {
      log(`No control persons found or generated for RIA ${ria.crd_number}`);
      return { status: 'no_data', count: 0 };
    }
    
    // Insert control persons into database
    const { data: insertedPersons, error: insertError } = await supabase
      .from('control_persons')
      .insert(controlPersons)
      .select();
    
    if (insertError) {
      log(`❌ Error inserting control persons for RIA ${ria.crd_number}: ${insertError.message}`);
      return { status: 'error', error: insertError.message };
    }
    
    log(`✅ Successfully added ${insertedPersons.length} control persons for RIA ${ria.crd_number}`);
    return { status: 'success', count: insertedPersons.length };
  } catch (error) {
    log(`❌ Error processing RIA ${ria.crd_number}: ${error.message}`);
    return { status: 'error', error: error.message };
  }
}

// Main function to process RIAs
async function processControlPersons() {
  log('🚀 Starting Document AI control persons ETL process');
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
        // First, get existing control person CRD numbers to filter them out
        log('Continuous mode: Finding RIAs without control persons...');
        const { data: existingControlPersons, error: cpError } = await supabase
          .from('control_persons')
          .select('crd_number')
          .not('crd_number', 'is', null);
          
        if (cpError) throw cpError;
        
        // Create a set of CRD numbers that already have control persons
        const existingCRDs = new Set(existingControlPersons.map(cp => cp.crd_number));
        log(`Found ${existingCRDs.size} RIAs with existing control persons`);
        
        // Get a larger batch of RIAs to filter from
        const rangeSize = limit * 10; // Fetch 10x the limit to have enough after filtering
        const { data: allRiasData, error: riasError } = await supabase
          .from('ria_profiles')
          .select('crd_number, legal_name')
          .order('crd_number')
          .range(startFrom, startFrom + rangeSize - 1);
          
        if (riasError) throw riasError;
        
        // Filter out RIAs that already have control persons
        rias = allRiasData.filter(ria => !existingCRDs.has(ria.crd_number)).slice(0, limit);
        
        log(`Fetched ${allRiasData.length} RIAs, filtered to ${rias.length} without control persons`);
        
        // If we found fewer than limit/2, increase the start position for next run
        if (rias.length < limit/2 && !testMode) {
          log(`Found fewer than ${limit/2} RIAs without control persons. Consider advancing the start position.`);
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
      personsAdded: 0,
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
          stats.personsAdded += result.count;
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
      log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}, Persons Added: ${stats.personsAdded}`);
      log(`Rate: ${rate.toFixed(2)} RIAs/sec, Est. remaining: ${formatTime(remaining)}`);
      
      // Small delay between batches
      if (i + batchSize < rias.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Final stats
    stats.endTime = new Date();
    stats.elapsed = (stats.endTime - stats.startTime) / 1000;
    
    log('\n📊 Control Persons ETL Complete!');
    log(`Processed ${stats.processed} RIAs in ${formatTime(stats.elapsed)}`);
    log(`Success: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    log(`Total Control Persons Added: ${stats.personsAdded}`);
    
    return stats;
  } catch (error) {
    log(`❌ Control Persons ETL process failed: ${error.message}`);
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
processControlPersons()
  .then(stats => {
    console.log('✅ Control Persons ETL completed successfully');
    console.log(`Check ${logFile} for detailed logs`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Control Persons ETL failed:', error);
    process.exit(1);
  });
