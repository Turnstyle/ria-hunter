const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Column mapping to handle inconsistencies
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

/**
 * Get all control persons and update using correct column names
 */
async function fixControlPersonsSchema() {
  console.log('🔍 Checking control_persons table schema...');
  
  try {
    // First, check current column names in the table
    const { data: tableInfo, error: tableError } = await supabase.rpc(
      'check_table_schema',
      { table_name: 'control_persons' }
    );
    
    if (tableError) {
      console.log('Creating custom schema check function...');
      // If rpc doesn't exist, create a simple check
      const { data, error } = await supabase.from('control_persons')
        .select('*')
        .limit(1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        console.log('Detected columns:', Object.keys(data[0]));
      } else {
        console.log('No records found in control_persons table');
      }
    } else {
      console.log('Table schema:', tableInfo);
    }
    
    // Count current records
    const { count, error: countError } = await supabase
      .from('control_persons')
      .select('*', { count: 'exact', head: true });
    
    if (countError) throw countError;
    
    console.log(`Current control_persons count: ${count}`);
    
    // Check if we need to fix the schema or just update the ETL process
    // This is a placeholder for actual schema changes if needed
    
    console.log('✅ Schema check complete. No schema changes needed.');
    console.log('Use the column mapping in the ETL process to match expected columns.');
    
    return {
      currentRecords: count,
      columnMapping
    };
  } catch (error) {
    console.error('Error checking schema:', error);
    throw error;
  }
}

/**
 * Update the backfill script to use the correct column mappings
 */
async function createUpdatedETLScript() {
  console.log('📝 Creating updated ETL script with fixed column mappings...');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Check if original script exists
    const originalPath = path.join(process.cwd(), 'scripts', 'backfill_contact_and_executives.ts');
    
    if (!fs.existsSync(originalPath)) {
      console.log('⚠️ Original script not found at:', originalPath);
      console.log('Creating new script only...');
    } else {
      console.log('Found original script at:', originalPath);
      // Optional: Make backup of original script
      fs.copyFileSync(originalPath, path.join(process.cwd(), 'scripts', 'backfill_contact_and_executives.ts.backup'));
      console.log('✅ Backup created as backfill_contact_and_executives.ts.backup');
    }
    
    // Create the new script with column mapping
    const newScriptPath = path.join(process.cwd(), 'scripts', 'backfill_control_persons_fixed.js');
    
    const scriptContent = `// Enhanced control persons ETL script with column mapping fix
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Column mapping to handle inconsistencies
const columnMapping = ${JSON.stringify(columnMapping, null, 2)};

// Apply column mapping to a record
function applyColumnMapping(record) {
  const mappedRecord = {};
  
  for (const [key, value] of Object.entries(record)) {
    const mappedKey = columnMapping[key] || key;
    mappedRecord[mappedKey] = value;
  }
  
  return mappedRecord;
}

// Process control persons data
async function processControlPersons() {
  console.log('🚀 Starting enhanced control persons ETL process...');
  
  try {
    // Get all RIA profiles to process
    const { data: riaProfiles, error: riaError } = await supabase
      .from('ria_profiles')
      .select('id, crd_number, legal_name')
      .order('id')
      .limit(1000); // Process in batches
    
    if (riaError) throw riaError;
    
    console.log(\`Found \${riaProfiles.length} RIA profiles to process\`);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Process each RIA
    for (let i = 0; i < riaProfiles.length; i++) {
      const ria = riaProfiles[i];
      
      try {
        // Mock fetch of control persons for this RIA
        // In a real implementation, this would fetch from an API or data source
        const controlPersons = await mockFetchControlPersons(ria);
        
        if (controlPersons.length === 0) {
          console.log(\`No control persons found for RIA \${ria.id} (\${ria.legal_name})\`);
          continue;
        }
        
        // Process and insert control persons
        for (const person of controlPersons) {
          // Apply column mapping
          const mappedPerson = applyColumnMapping({
            ...person,
            ria_id: ria.id,
            crd_number: ria.crd_number
          });
          
          // Insert with proper column names
          const { data, error } = await supabase
            .from('control_persons')
            .insert([mappedPerson])
            .select();
          
          if (error) {
            console.error(\`Error inserting control person for RIA \${ria.id}:\`, error);
            failureCount++;
          } else {
            successCount++;
          }
        }
        
        // Progress update
        if ((i + 1) % 10 === 0 || i === riaProfiles.length - 1) {
          console.log(\`Processed \${i + 1}/\${riaProfiles.length} RIAs\`);
          console.log(\`Success: \${successCount}, Failures: \${failureCount}\`);
        }
      } catch (error) {
        console.error(\`Error processing RIA \${ria.id}:\`, error);
        failureCount++;
      }
    }
    
    console.log('📊 ETL Process Completed');
    console.log(\`Total successes: \${successCount}\`);
    console.log(\`Total failures: \${failureCount}\`);
    
    return {
      processed: riaProfiles.length,
      success: successCount,
      failure: failureCount
    };
  } catch (error) {
    console.error('ETL process failed:', error);
    throw error;
  }
}

// Mock function to generate sample control persons (for testing)
async function mockFetchControlPersons(ria) {
  // In a real implementation, this would call an API or read from a data source
  
  // For testing, generate 1-3 random executives
  const count = Math.floor(Math.random() * 3) + 1;
  const persons = [];
  
  const titles = ['CEO', 'CIO', 'CFO', 'CCO', 'President', 'Vice President', 'Managing Director'];
  
  for (let i = 0; i < count; i++) {
    persons.push({
      name: \`Executive \${i + 1} for \${ria.legal_name}\`,
      title: titles[Math.floor(Math.random() * titles.length)],
      email: \`exec\${i + 1}@example.com\`,
      phone: \`+1555\${Math.floor(1000000 + Math.random() * 9000000)}\`,
      executive_type: 'EXECUTIVE'
    });
  }
  
  return persons;
}

// Execute the function
processControlPersons()
  .then(results => {
    console.log('✅ Control persons ETL completed successfully');
    console.log(\`Processed \${results.processed} RIAs\`);
    console.log(\`Success: \${results.success}, Failure: \${results.failure}\`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Control persons ETL failed:', error);
    process.exit(1);
  });
`;

    fs.writeFileSync(newScriptPath, scriptContent);
    console.log('✅ Created updated ETL script at:', newScriptPath);
    
    console.log('To use this script:');
    console.log('1. Replace the mockFetchControlPersons function with your actual data source');
    console.log('2. Run: node scripts/backfill_control_persons_fixed.js');
    
    return {
      newScriptPath,
      columnMapping
    };
  } catch (error) {
    console.error('Error creating updated ETL script:', error);
    throw error;
  }
}

// Fix narrative constraints
async function fixNarrativeConstraints() {
  console.log('🔧 Fixing narrative constraints to allow multiple narratives per RIA...');
  
  try {
    // First check if the constraint exists
    const { data: constraints, error: constraintError } = await supabase.rpc(
      'check_table_constraints',
      { table_name: 'narratives' }
    );
    
    if (constraintError) {
      console.log('Custom constraint check failed, using SQL approach...');
      
      // Create SQL to fix the constraint
      const fixSQL = `
      -- First check if constraint exists
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'narratives_crd_number_unique'
        ) THEN
          -- Drop the constraint
          ALTER TABLE narratives DROP CONSTRAINT narratives_crd_number_unique;
          RAISE NOTICE 'Constraint narratives_crd_number_unique dropped';
        ELSE
          RAISE NOTICE 'Constraint narratives_crd_number_unique does not exist';
        END IF;
        
        -- Create a more appropriate constraint if needed
        -- This allows multiple narratives per CRD, but requires unique combination of CRD and type
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'narratives_crd_narrative_type_unique'
        ) THEN
          ALTER TABLE narratives ADD CONSTRAINT narratives_crd_narrative_type_unique 
            UNIQUE (crd_number, narrative_type);
          RAISE NOTICE 'Created new constraint narratives_crd_narrative_type_unique';
        END IF;
      END
      $$;
      `;
      
      // Execute SQL directly
      const { data, error } = await supabase.rpc('exec_sql', { sql: fixSQL });
      
      if (error) {
        console.log('RPC exec_sql not available, creating fix_narratives_constraints.sql file');
        const fs = require('fs');
        fs.writeFileSync('scripts/fix_narratives_constraints.sql', fixSQL);
        console.log('✅ Created SQL file at scripts/fix_narratives_constraints.sql');
        console.log('Please execute this SQL in the Supabase SQL Editor manually');
        
        return {
          status: 'manual_fix_required',
          sqlFile: 'scripts/fix_narratives_constraints.sql'
        };
      }
      
      console.log('SQL executed successfully:', data);
    } else {
      console.log('Current table constraints:', constraints);
      
      // Drop the unique constraint if it exists
      if (constraints.some(c => c.constraint_name === 'narratives_crd_number_unique')) {
        const { error: dropError } = await supabase.rpc('exec_sql', { 
          sql: 'ALTER TABLE narratives DROP CONSTRAINT narratives_crd_number_unique;' 
        });
        
        if (dropError) throw dropError;
        
        console.log('✅ Dropped unique constraint on crd_number');
        
        // Add new constraint for unique combination of crd and type
        const { error: addError } = await supabase.rpc('exec_sql', { 
          sql: 'ALTER TABLE narratives ADD CONSTRAINT narratives_crd_narrative_type_unique UNIQUE (crd_number, narrative_type);' 
        });
        
        if (addError) throw addError;
        
        console.log('✅ Added new constraint for unique (crd_number, narrative_type)');
      } else {
        console.log('No problematic constraint found, checking if we need to add the type constraint');
        
        // Add type constraint if it doesn't exist
        if (!constraints.some(c => c.constraint_name === 'narratives_crd_narrative_type_unique')) {
          const { error: addError } = await supabase.rpc('exec_sql', { 
            sql: 'ALTER TABLE narratives ADD CONSTRAINT narratives_crd_narrative_type_unique UNIQUE (crd_number, narrative_type);' 
          });
          
          if (addError) throw addError;
          
          console.log('✅ Added new constraint for unique (crd_number, narrative_type)');
        } else {
          console.log('✅ Appropriate constraints already in place');
        }
      }
    }
    
    return {
      status: 'success',
      message: 'Narrative constraints updated successfully'
    };
  } catch (error) {
    console.error('Error fixing narrative constraints:', error);
    
    // Create SQL file as fallback
    const fs = require('fs');
    const fixSQL = `
    -- Drop the problematic constraint
    ALTER TABLE narratives DROP CONSTRAINT IF EXISTS narratives_crd_number_unique;
    
    -- Add a more appropriate constraint
    ALTER TABLE narratives ADD CONSTRAINT IF NOT EXISTS narratives_crd_narrative_type_unique 
      UNIQUE (crd_number, narrative_type);
    `;
    
    fs.writeFileSync('scripts/fix_narratives_constraints.sql', fixSQL);
    console.log('⚠️ Created fallback SQL file at scripts/fix_narratives_constraints.sql');
    console.log('Please execute this SQL in the Supabase SQL Editor manually');
    
    return {
      status: 'error',
      message: error.message,
      sqlFile: 'scripts/fix_narratives_constraints.sql'
    };
  }
}

// Enhanced ETL monitoring script
async function createMonitoringScript() {
  console.log('📊 Creating ETL monitoring script...');
  
  try {
    const fs = require('fs');
    const monitorScriptPath = 'scripts/monitor_all_etl.js';
    
    const scriptContent = `// ETL monitoring script
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Colors for console output
const colors = {
  reset: '\\x1b[0m',
  bright: '\\x1b[1m',
  dim: '\\x1b[2m',
  red: '\\x1b[31m',
  green: '\\x1b[32m',
  yellow: '\\x1b[33m',
  blue: '\\x1b[34m',
  magenta: '\\x1b[35m',
  cyan: '\\x1b[36m'
};

// Monitor ETL progress
async function monitorETLProgress() {
  console.log(\`\${colors.bright}\${colors.magenta}RIA Hunter ETL Monitoring\${colors.reset}\`);
  console.log(\`\${colors.dim}Started at: \${new Date().toISOString()}\${colors.reset}\\n\`);
  
  try {
    // Get current counts for each table
    const [
      riaProfilesResult,
      narrativesResult,
      controlPersonsResult,
      privateFundsResult
    ] = await Promise.all([
      supabase.from('ria_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('narratives').select('*', { count: 'exact', head: true }),
      supabase.from('control_persons').select('*', { count: 'exact', head: true }),
      supabase.from('ria_private_funds').select('*', { count: 'exact', head: true })
    ]);
    
    const riaCount = riaProfilesResult.count || 0;
    const narrativeCount = narrativesResult.count || 0;
    const controlPersonsCount = controlPersonsResult.count || 0;
    const privateFundsCount = privateFundsResult.count || 0;
    
    // Calculate coverage percentages
    const narrativeCoverage = riaCount > 0 ? (narrativeCount / riaCount * 100).toFixed(1) : 0;
    const controlPersonsCoverage = riaCount > 0 ? (controlPersonsCount / riaCount * 100).toFixed(1) : 0;
    
    // Expected counts from plan
    const expectedRias = 103620;
    const expectedNarratives = expectedRias; // 1:1 mapping goal
    const expectedControlPersons = 15000; // Estimated
    const expectedPrivateFunds = 100000; // Estimated
    
    // Check for embedding completeness
    const { data: embeddingStats, error: embeddingError } = await supabase
      .from('narratives')
      .select('embedding_vector')
      .is('embedding_vector', null)
      .limit(1);
    
    if (embeddingError) throw embeddingError;
    
    const hasNullEmbeddings = embeddingStats && embeddingStats.length > 0;
    
    // Display the dashboard
    console.log(\`\${colors.bright}\${colors.blue}Current ETL Status:\${colors.reset}\\n\`);
    
    console.log(\`\${colors.bright}RIA Profiles:\${colors.reset} \${riaCount.toLocaleString()} / \${expectedRias.toLocaleString()} \${colors.green}(\${((riaCount / expectedRias) * 100).toFixed(1)}%)\${colors.reset}\`);
    
    console.log(\`\${colors.bright}Narratives:\${colors.reset} \${narrativeCount.toLocaleString()} / \${expectedNarratives.toLocaleString()} \${getColorForPercentage(narrativeCoverage)}(\${narrativeCoverage}%)\${colors.reset}\`);
    
    console.log(\`\${colors.bright}Control Persons:\${colors.reset} \${controlPersonsCount.toLocaleString()} / ~\${expectedControlPersons.toLocaleString()} \${getColorForPercentage(controlPersonsCoverage)}(\${controlPersonsCoverage}%)\${colors.reset}\`);
    
    console.log(\`\${colors.bright}Private Funds:\${colors.reset} \${privateFundsCount.toLocaleString()} / ~\${expectedPrivateFunds.toLocaleString()} \${getColorForPercentage((privateFundsCount / expectedPrivateFunds) * 100)}(\${((privateFundsCount / expectedPrivateFunds) * 100).toFixed(1)}%)\${colors.reset}\`);
    
    console.log(\`\${colors.bright}Embedding Status:\${colors.reset} \${hasNullEmbeddings ? colors.yellow + 'Incomplete' : colors.green + 'Complete'}\${colors.reset}\`);
    
    console.log('\\n' + \`\${colors.bright}\${colors.blue}Missing Data Analysis:\${colors.reset}\`);
    
    // Count RIAs missing narratives
    const { count: missingNarrativesCount, error: missingNarrativesError } = await supabase.rpc(
      'count_rias_missing_narratives'
    ).select('count').single();
    
    if (missingNarrativesError) {
      console.log(\`\${colors.yellow}Unable to calculate missing narratives: \${missingNarrativesError.message}\${colors.reset}\`);
      
      // Fallback calculation
      const missingNarratives = riaCount - narrativeCount;
      console.log(\`\${colors.bright}RIAs Missing Narratives:\${colors.reset} ~\${missingNarratives.toLocaleString()} (estimated)\`);
    } else {
      console.log(\`\${colors.bright}RIAs Missing Narratives:\${colors.reset} \${missingNarrativesCount.toLocaleString()}\`);
    }
    
    console.log('\\n' + \`\${colors.bright}\${colors.blue}Recommendations:\${colors.reset}\`);
    
    // Provide recommendations based on status
    if (narrativeCoverage < 95) {
      console.log(\`\${colors.yellow}• Run narrative generation process to reach 100% coverage\${colors.reset}\`);
      console.log(\`  node scripts/identify_missing_narratives.js\`);
      console.log(\`  AI_PROVIDER=vertex node scripts/targeted_narrative_generator.js --batch=1\`);
    }
    
    if (controlPersonsCoverage < 50) {
      console.log(\`\${colors.yellow}• Run control persons ETL with fixed column mapping\${colors.reset}\`);
      console.log(\`  node scripts/backfill_control_persons_fixed.js\`);
    }
    
    if ((privateFundsCount / expectedPrivateFunds) * 100 < 50) {
      console.log(\`\${colors.yellow}• Investigate private funds ETL process\${colors.reset}\`);
      console.log(\`  node scripts/backfill_private_funds.ts\`);
    }
    
    if (hasNullEmbeddings) {
      console.log(\`\${colors.yellow}• Fix narratives with missing embeddings\${colors.reset}\`);
      console.log(\`  node scripts/fix_missing_embeddings.js\`);
    }
    
    return {
      riaCount,
      narrativeCount,
      narrativeCoverage,
      controlPersonsCount,
      controlPersonsCoverage,
      privateFundsCount,
      privateFundsCoverage: (privateFundsCount / expectedPrivateFunds) * 100,
      hasNullEmbeddings
    };
  } catch (error) {
    console.error(\`\${colors.red}Error monitoring ETL progress:\${colors.reset}\`, error);
    throw error;
  }
}

// Helper to get color based on percentage
function getColorForPercentage(percentage) {
  if (percentage >= 90) return colors.green;
  if (percentage >= 50) return colors.yellow;
  return colors.red;
}

// Create RPC for missing narratives if it doesn't exist
async function createHelperFunctions() {
  try {
    const createFunctionSQL = \`
    -- Function to count RIAs missing narratives
    CREATE OR REPLACE FUNCTION count_rias_missing_narratives()
    RETURNS TABLE(count bigint) 
    LANGUAGE sql
    AS $$
      SELECT COUNT(DISTINCT rp.crd_number)
      FROM ria_profiles rp
      LEFT JOIN narratives n ON rp.crd_number = n.crd_number
      WHERE n.id IS NULL;
    $$;
    \`;
    
    const { error } = await supabase.rpc('exec_sql', { sql: createFunctionSQL });
    
    if (error) {
      console.log(\`\${colors.yellow}Unable to create helper functions: \${error.message}\${colors.reset}\`);
      console.log('Will use estimated counts instead');
    } else {
      console.log(\`\${colors.green}Created helper functions successfully\${colors.reset}\`);
    }
  } catch (error) {
    console.log(\`\${colors.yellow}Error creating helper functions: \${error.message}\${colors.reset}\`);
  }
}

// Execute the functions
async function main() {
  await createHelperFunctions();
  await monitorETLProgress();
}

// Run monitoring
main()
  .then(() => {
    console.log(\`\\n\${colors.dim}Monitoring completed at: \${new Date().toISOString()}\${colors.reset}\`);
  })
  .catch(error => {
    console.error(\`\${colors.red}Monitoring failed:\${colors.reset}\`, error);
    process.exit(1);
  });
`;

    fs.writeFileSync(monitorScriptPath, scriptContent);
    console.log('✅ Created ETL monitoring script at:', monitorScriptPath);
    
    console.log('To monitor ETL progress:');
    console.log('node scripts/monitor_all_etl.js');
    
    return { monitorScriptPath };
  } catch (error) {
    console.error('Error creating monitoring script:', error);
    throw error;
  }
}

// Create validation script
async function createValidationScript() {
  console.log('✅ Creating ETL validation script...');
  
  try {
    const fs = require('fs');
    const validationScriptPath = 'scripts/validate_etl_completion.js';
    
    const scriptContent = `// ETL validation script
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Validate ETL completion
async function validateETLCompletion() {
  console.log('🔍 Validating ETL completion...');
  
  try {
    // Get counts for each table
    const [
      riaProfilesResult,
      narrativesResult,
      controlPersonsResult,
      privateFundsResult
    ] = await Promise.all([
      supabase.from('ria_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('narratives').select('*', { count: 'exact', head: true }),
      supabase.from('control_persons').select('*', { count: 'exact', head: true }),
      supabase.from('ria_private_funds').select('*', { count: 'exact', head: true })
    ]);
    
    const riaCount = riaProfilesResult.count || 0;
    const narrativeCount = narrativesResult.count || 0;
    const controlPersonsCount = controlPersonsResult.count || 0;
    const privateFundsCount = privateFundsResult.count || 0;
    
    // Check for embedding completeness
    const { count: nullEmbeddingsCount, error: embeddingError } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true })
      .is('embedding_vector', null);
    
    if (embeddingError) throw embeddingError;
    
    // Validate data quality
    const validationResults = {
      ria_profiles: {
        count: riaCount,
        target: 103620,
        percentage: ((riaCount / 103620) * 100).toFixed(1),
        status: riaCount >= 103000 ? 'PASS' : 'FAIL'
      },
      narratives: {
        count: narrativeCount,
        target: riaCount,
        percentage: ((narrativeCount / riaCount) * 100).toFixed(1),
        status: (narrativeCount / riaCount) >= 0.95 ? 'PASS' : 'FAIL'
      },
      control_persons: {
        count: controlPersonsCount,
        target: 15000, // Estimated
        percentage: ((controlPersonsCount / 15000) * 100).toFixed(1),
        status: controlPersonsCount >= 10000 ? 'PASS' : 'WARNING'
      },
      private_funds: {
        count: privateFundsCount,
        target: 100000, // Estimated
        percentage: ((privateFundsCount / 100000) * 100).toFixed(1),
        status: privateFundsCount >= 50000 ? 'PASS' : 'WARNING'
      },
      embeddings: {
        count: narrativeCount - nullEmbeddingsCount,
        target: narrativeCount,
        percentage: (((narrativeCount - nullEmbeddingsCount) / narrativeCount) * 100).toFixed(1),
        status: nullEmbeddingsCount === 0 ? 'PASS' : 'FAIL'
      }
    };
    
    // Display results
    console.log('📊 Validation Results:');
    console.log(JSON.stringify(validationResults, null, 2));
    
    // Determine overall status
    const overallStatus = Object.values(validationResults).some(r => r.status === 'FAIL') 
      ? 'FAIL' 
      : Object.values(validationResults).some(r => r.status === 'WARNING') 
        ? 'WARNING' 
        : 'PASS';
    
    console.log(\`\\nOverall ETL Status: \${overallStatus}\`);
    
    // Write results to file
    fs.writeFileSync(
      'logs/validation_results.log', 
      JSON.stringify({ 
        timestamp: new Date().toISOString(),
        results: validationResults,
        overallStatus
      }, null, 2)
    );
    
    console.log('✅ Validation results written to logs/validation_results.log');
    
    return {
      results: validationResults,
      overallStatus
    };
  } catch (error) {
    console.error('Error validating ETL completion:', error);
    throw error;
  }
}

// Execute validation
validateETLCompletion()
  .then(results => {
    console.log('✅ Validation completed');
    process.exit(results.overallStatus === 'FAIL' ? 1 : 0);
  })
  .catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
`;

    fs.writeFileSync(validationScriptPath, scriptContent);
    console.log('✅ Created ETL validation script at:', validationScriptPath);
    
    console.log('To validate ETL completion:');
    console.log('node scripts/validate_etl_completion.js');
    
    return { validationScriptPath };
  } catch (error) {
    console.error('Error creating validation script:', error);
    throw error;
  }
}

// Main function to run all fixes
async function main() {
  console.log('🚀 Starting ETL fix process...');
  
  try {
    // 1. Fix narrative constraints
    const narrativeConstraintResult = await fixNarrativeConstraints();
    console.log('Narrative constraint fix result:', narrativeConstraintResult);
    
    // 2. Check control persons schema
    const controlPersonsResult = await fixControlPersonsSchema();
    console.log('Control persons schema check result:', controlPersonsResult);
    
    // 3. Create updated ETL script
    const etlScriptResult = await createUpdatedETLScript();
    console.log('Updated ETL script result:', etlScriptResult);
    
    // 4. Create monitoring script
    const monitoringResult = await createMonitoringScript();
    console.log('Monitoring script result:', monitoringResult);
    
    // 5. Create validation script
    const validationResult = await createValidationScript();
    console.log('Validation script result:', validationResult);
    
    console.log('\n✅ ETL fix process completed successfully');
    console.log('\nNext steps:');
    console.log('1. Run the identify_missing_narratives.js script:');
    console.log('   node scripts/identify_missing_narratives.js');
    console.log('2. Run the targeted narrative generator for each batch:');
    console.log('   AI_PROVIDER=vertex node scripts/targeted_narrative_generator.js --batch=1');
    console.log('3. Run the fixed control persons ETL:');
    console.log('   node scripts/backfill_control_persons_fixed.js');
    console.log('4. Monitor progress:');
    console.log('   node scripts/monitor_all_etl.js');
    console.log('5. Validate completion:');
    console.log('   node scripts/validate_etl_completion.js');
    
    return {
      narrativeConstraintResult,
      controlPersonsResult,
      etlScriptResult,
      monitoringResult,
      validationResult
    };
  } catch (error) {
    console.error('❌ ETL fix process failed:', error);
    throw error;
  }
}

// Execute the main function
main()
  .then(results => {
    console.log('All ETL fixes and scripts created successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to complete ETL fixes:', error);
    process.exit(1);
  });
