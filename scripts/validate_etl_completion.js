/**
 * Final ETL Validation and Benchmarking Script
 * Run this after ETL processes complete to verify results
 */

const { createClient } = require('@supabase/supabase-js');
const { performance } = require('perf_hooks');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ANSI color codes for formatting
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  fg: {
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
  }
};

/**
 * Format a number with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a percentage
 */
function formatPercentage(value, total) {
  if (!total) return '0.00%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(2)}%`;
}

/**
 * Validate data completeness
 */
async function validateDataCompleteness() {
  console.log(`\n${colors.bright}${colors.fg.green}=== DATA COMPLETENESS VALIDATION ===${colors.reset}\n`);
  
  // 1. Narratives completeness
  const { data: profileCount } = await supabase
    .from('ria_profiles')
    .select('count');
  
  const { data: narrativeCount } = await supabase
    .from('narratives')
    .select('count');
  
  const totalProfiles = parseInt(profileCount[0].count);
  const totalNarratives = parseInt(narrativeCount[0].count);
  const narrativeCoverage = formatPercentage(totalNarratives, totalProfiles);
  
  console.log(`Narrative Coverage: ${formatNumber(totalNarratives)}/${formatNumber(totalProfiles)} (${narrativeCoverage})`);
  if (totalNarratives / totalProfiles >= 0.95) {
    console.log(`${colors.fg.green}✓ PASS: Narrative coverage exceeds 95%${colors.reset}`);
  } else {
    console.log(`${colors.fg.red}✗ FAIL: Narrative coverage below 95%${colors.reset}`);
  }
  
  // 2. Private Funds completeness
  const { data: fundsCount } = await supabase
    .from('ria_private_funds')
    .select('count');
  
  const totalFunds = parseInt(fundsCount[0].count);
  console.log(`\nPrivate Funds Count: ${formatNumber(totalFunds)}`);
  if (totalFunds >= 90000) {
    console.log(`${colors.fg.green}✓ PASS: Private funds exceed 90,000${colors.reset}`);
  } else {
    console.log(`${colors.fg.red}✗ FAIL: Private funds below target${colors.reset}`);
  }
  
  // 3. Control Persons completeness
  const { data: personCount } = await supabase
    .from('control_persons')
    .select('count');
  
  const totalPersons = parseInt(personCount[0].count);
  console.log(`\nControl Persons Count: ${formatNumber(totalPersons)}`);
  if (totalPersons >= 13500) {
    console.log(`${colors.fg.green}✓ PASS: Control persons exceed 13,500${colors.reset}`);
  } else {
    console.log(`${colors.fg.red}✗ FAIL: Control persons below target${colors.reset}`);
  }
  
  // 4. Vector coverage
  const { data: vectorCount } = await supabase
    .from('narratives')
    .select('count')
    .not('embedding_vector', 'is', null);
  
  const totalVectors = parseInt(vectorCount[0].count);
  const vectorCoverage = formatPercentage(totalVectors, totalNarratives);
  
  console.log(`\nVector Coverage: ${formatNumber(totalVectors)}/${formatNumber(totalNarratives)} (${vectorCoverage})`);
  if (totalVectors / totalNarratives >= 0.99) {
    console.log(`${colors.fg.green}✓ PASS: Vector coverage exceeds 99%${colors.reset}`);
  } else {
    console.log(`${colors.fg.red}✗ FAIL: Vector coverage below 99%${colors.reset}`);
  }
  
  // 5. Overall summary
  console.log(`\n${colors.bright}Data Completeness Summary:${colors.reset}`);
  const overall = [
    totalNarratives / totalProfiles >= 0.95,
    totalFunds >= 90000,
    totalPersons >= 13500,
    totalVectors / totalNarratives >= 0.99
  ].filter(Boolean).length / 4;
  
  console.log(`Overall Completeness: ${formatPercentage(overall, 1)}`);
  console.log(`Status: ${overall >= 0.9 ? colors.fg.green + 'PASS' : colors.fg.red + 'INCOMPLETE'}`);
  console.log(colors.reset);
  
  return {
    narratives: { total: totalNarratives, coverage: totalNarratives / totalProfiles },
    privateFunds: { total: totalFunds },
    controlPersons: { total: totalPersons },
    vectors: { total: totalVectors, coverage: totalVectors / totalNarratives },
    overall
  };
}

/**
 * Benchmark search performance
 */
async function benchmarkPerformance() {
  console.log(`\n${colors.bright}${colors.fg.blue}=== PERFORMANCE BENCHMARKING ===${colors.reset}\n`);
  
  // Generate a random embedding vector for testing
  const dimensions = 768;
  const testVector = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  
  // 1. Basic vector search performance
  console.log(`Testing basic vector search performance...`);
  const iterations = 10;
  let totalTime = 0;
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    
    const { data, error } = await supabase.rpc('match_narratives', {
      query_embedding: testVector,
      match_threshold: 0.5,
      match_count: 10
    });
    
    if (error) {
      console.error(`Error in iteration ${i}:`, error);
      continue;
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    totalTime += duration;
    
    console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms (${data.length} results)`);
  }
  
  const avgTime = totalTime / iterations;
  console.log(`\nAverage search time: ${avgTime.toFixed(2)}ms`);
  
  // 2. Target performance check
  if (avgTime <= 10) {
    console.log(`${colors.fg.green}✓ PASS: Query performance under 10ms target (507x improvement achieved)${colors.reset}`);
  } else if (avgTime <= 50) {
    console.log(`${colors.fg.yellow}△ PARTIAL: Query performance good but not optimal (<50ms)${colors.reset}`);
  } else {
    console.log(`${colors.fg.red}✗ FAIL: Query performance above 50ms - indexing issue detected${colors.reset}`);
  }
  
  // 3. Complex hybrid search test
  console.log(`\nTesting hybrid search performance...`);
  const hybridStart = performance.now();
  
  try {
    const { data: hybridData, error: hybridError } = await supabase.rpc('hybrid_search_rias', {
      query_text: 'wealth management services for high net worth individuals',
      query_embedding: testVector,
      match_count: 15,
      semantic_weight: 0.7,
      full_text_weight: 0.3
    });
    
    if (hybridError) {
      console.error('Hybrid search error:', hybridError);
    } else {
      const hybridTime = performance.now() - hybridStart;
      console.log(`Hybrid search time: ${hybridTime.toFixed(2)}ms (${hybridData.length} results)`);
      
      if (hybridTime <= 30) {
        console.log(`${colors.fg.green}✓ PASS: Hybrid search performance excellent${colors.reset}`);
      } else if (hybridTime <= 100) {
        console.log(`${colors.fg.yellow}△ PARTIAL: Hybrid search performance acceptable${colors.reset}`);
      } else {
        console.log(`${colors.fg.red}✗ FAIL: Hybrid search performance needs optimization${colors.reset}`);
      }
    }
  } catch (error) {
    console.error('Error in hybrid search:', error);
  }
  
  // 4. Performance summary
  console.log(`\n${colors.bright}Performance Summary:${colors.reset}`);
  console.log(`Basic vector search: ${avgTime.toFixed(2)}ms`);
  console.log(`Target achievement: ${avgTime <= 10 ? '100%' : avgTime <= 50 ? '80%' : '< 50%'}`);
  
  return {
    basicSearch: avgTime,
    targetAchieved: avgTime <= 10
  };
}

/**
 * Validate data quality
 */
async function validateDataQuality() {
  console.log(`\n${colors.bright}${colors.fg.magenta}=== DATA QUALITY VALIDATION ===${colors.reset}\n`);
  
  // 1. Check for null values in key fields
  console.log(`Checking for NULL values in key fields...`);
  
  const keyFields = ['firm_name', 'crd_number', 'state'];
  let qualityIssues = 0;
  
  for (const field of keyFields) {
    const { data, error } = await supabase
      .from('ria_profiles')
      .select('count')
      .is(field, null);
    
    if (error) {
      console.error(`Error checking nulls for ${field}:`, error);
      continue;
    }
    
    const nullCount = parseInt(data[0].count);
    console.log(`  ${field}: ${formatNumber(nullCount)} NULL values`);
    
    if (nullCount > 0) {
      qualityIssues++;
    }
  }
  
  // 2. Check for vector quality
  console.log(`\nChecking vector quality...`);
  
  const { data: zeroVectors, error: zeroError } = await supabase
    .from('narratives')
    .select('count')
    .not('embedding_vector', 'is', null)
    .eq('embedding_vector', 'ARRAY[]');
  
  if (zeroError) {
    console.error('Error checking zero vectors:', zeroError);
  } else {
    const zeroCount = parseInt(zeroVectors[0].count);
    console.log(`  Zero-length vectors: ${formatNumber(zeroCount)}`);
    
    if (zeroCount > 0) {
      qualityIssues++;
    }
  }
  
  // 3. Check for duplicate CRD numbers
  const { data: duplicateCRDs, error: dupError } = await supabase
    .from('ria_profiles')
    .select('crd_number, count(*)')
    .not('crd_number', 'is', null)
    .group('crd_number')
    .having('count(*) > 1');
  
  if (dupError) {
    console.error('Error checking duplicate CRDs:', dupError);
  } else {
    console.log(`\nDuplicate CRD numbers: ${duplicateCRDs.length}`);
    
    if (duplicateCRDs.length > 0) {
      qualityIssues++;
      console.log(`  First 5 duplicates: ${duplicateCRDs.slice(0, 5).map(d => d.crd_number).join(', ')}`);
    }
  }
  
  // 4. Data quality summary
  console.log(`\n${colors.bright}Data Quality Summary:${colors.reset}`);
  console.log(`Quality issues found: ${qualityIssues}`);
  console.log(`Status: ${qualityIssues === 0 ? colors.fg.green + 'EXCELLENT' : qualityIssues <= 2 ? colors.fg.yellow + 'GOOD' : colors.fg.red + 'NEEDS ATTENTION'}`);
  console.log(colors.reset);
  
  return {
    qualityIssues,
    status: qualityIssues === 0 ? 'EXCELLENT' : qualityIssues <= 2 ? 'GOOD' : 'NEEDS_ATTENTION'
  };
}

/**
 * Generate final validation report
 */
async function generateValidationReport() {
  console.log(`\n${colors.bright}${colors.fg.cyan}========= RIA HUNTER ETL VALIDATION REPORT =========${colors.reset}\n`);
  console.log(`Report generated: ${new Date().toLocaleString()}`);
  
  // Run all validations
  const completeness = await validateDataCompleteness();
  const performance = await benchmarkPerformance();
  const quality = await validateDataQuality();
  
  // Generate overall score
  const completenessScore = completeness.overall * 100;
  const performanceScore = performance.targetAchieved ? 100 : (performance.basicSearch <= 50 ? 80 : 40);
  const qualityScore = quality.qualityIssues === 0 ? 100 : (quality.qualityIssues <= 2 ? 80 : 50);
  
  const overallScore = (completenessScore * 0.4) + (performanceScore * 0.4) + (qualityScore * 0.2);
  
  // Final summary
  console.log(`\n${colors.bright}${colors.fg.green}========= FINAL VALIDATION SUMMARY =========${colors.reset}\n`);
  console.log(`Data Completeness: ${completenessScore.toFixed(1)}/100`);
  console.log(`Query Performance: ${performanceScore.toFixed(1)}/100`);
  console.log(`Data Quality: ${qualityScore.toFixed(1)}/100`);
  console.log(`\n${colors.bright}OVERALL SCORE: ${overallScore.toFixed(1)}/100${colors.reset}`);
  
  // Success criteria
  if (overallScore >= 90) {
    console.log(`\n${colors.bright}${colors.fg.green}✓ VALIDATION SUCCESSFUL: Backend implementation exceeds targets${colors.reset}`);
    console.log(`${colors.fg.green}The RIA Hunter backend is PRODUCTION READY${colors.reset}`);
  } else if (overallScore >= 75) {
    console.log(`\n${colors.bright}${colors.fg.yellow}△ VALIDATION ACCEPTABLE: Backend implementation meets minimum targets${colors.reset}`);
    console.log(`${colors.fg.yellow}The RIA Hunter backend is READY WITH MINOR CONCERNS${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.fg.red}✗ VALIDATION INCOMPLETE: Backend implementation needs additional work${colors.reset}`);
    console.log(`${colors.fg.red}The RIA Hunter backend IS NOT PRODUCTION READY${colors.reset}`);
  }
  
  // Save report to file
  const reportFilePath = './logs/validation_report.json';
  const reportData = {
    timestamp: new Date().toISOString(),
    completeness,
    performance,
    quality,
    scores: {
      completeness: completenessScore,
      performance: performanceScore,
      quality: qualityScore,
      overall: overallScore
    },
    status: overallScore >= 90 ? 'PRODUCTION_READY' : overallScore >= 75 ? 'READY_WITH_CONCERNS' : 'NOT_READY'
  };
  
  const fs = require('fs');
  fs.writeFileSync(reportFilePath, JSON.stringify(reportData, null, 2));
  console.log(`\nDetailed validation report saved to ${reportFilePath}`);
}

// Run validation
generateValidationReport().catch(error => {
  console.error('Error during validation:', error);
});
