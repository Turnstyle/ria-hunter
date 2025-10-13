#!/usr/bin/env node

/**
 * Checks whether mv_firm_activity is in sync with its source views and optionally triggers a refresh.
 * - Compares row counts between base view and materialized view
 * - Samples top firms by activity_score to detect stale metrics
 * - Flags missing rows in either source
 *
 * Usage:
 *   node scripts/check_mv_firm_activity_refresh.js [--refresh]
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/check_mv_firm_activity_refresh.js [--refresh]');
  process.exit(0);
}

const shouldRefresh = args.includes('--refresh');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    throw new Error(`Failed to fetch count for ${table}: ${error.message}`);
  }
  return count || 0;
}

async function fetchSample(table, orderBy, ascending, limit) {
  const { data, error } = await supabase
    .from(table)
    .select('crd_number, activity_score, vc_fund_count, vc_total_aum')
    .order(orderBy, { ascending })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to fetch sample from ${table}: ${error.message}`);
  }
  return data || [];
}

function buildMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.crd_number === null || row.crd_number === undefined ? null : String(row.crd_number);
    if (!key) continue;
    map.set(key, {
      crd_number: key,
      activity_score: safeNumber(row.activity_score),
      vc_fund_count: safeNumber(row.vc_fund_count),
      vc_total_aum: safeNumber(row.vc_total_aum)
    });
  }
  return map;
}

async function triggerRefresh() {
  console.log('Triggering refresh_mv_firm_activity()...');
  const { error } = await supabase.rpc('refresh_mv_firm_activity');
  if (error) {
    throw new Error(`Failed to refresh mv_firm_activity: ${error.message}`);
  }
  console.log('Refresh completed.');
}

async function runChecks() {
  if (shouldRefresh) {
    await triggerRefresh();
  }

  console.log('Checking mv_firm_activity freshness...');

  const [baseCount, mvCount] = await Promise.all([
    fetchCount('private_fund_type_by_firm'),
    fetchCount('mv_firm_activity')
  ]);

  const baseTop = await fetchSample('private_fund_type_by_firm', 'activity_score', false, 75);
  const baseSorted = await fetchSample('private_fund_type_by_firm', 'crd_number', true, 75);
  const mvTop = await fetchSample('mv_firm_activity', 'activity_score', false, 75);
  const mvSorted = await fetchSample('mv_firm_activity', 'crd_number', true, 75);

  const baseMap = buildMap([...baseTop, ...baseSorted]);
  const mvMap = buildMap([...mvTop, ...mvSorted]);

  const combinedKeys = new Set([...baseMap.keys(), ...mvMap.keys()]);

  let maxScoreDiff = 0;
  let maxFundCountDiff = 0;
  let maxAumDiff = 0;
  const issues = [];

  for (const key of combinedKeys) {
    const baseRow = baseMap.get(key);
    const mvRow = mvMap.get(key);

    if (!baseRow) {
      issues.push({ type: 'missing_in_base_view', crd_number: key });
      continue;
    }
    if (!mvRow) {
      issues.push({ type: 'missing_in_materialized_view', crd_number: key });
      continue;
    }

    const scoreDiff = Math.abs(baseRow.activity_score - mvRow.activity_score);
    const fundCountDiff = Math.abs(baseRow.vc_fund_count - mvRow.vc_fund_count);
    const aumDiff = Math.abs(baseRow.vc_total_aum - mvRow.vc_total_aum);

    maxScoreDiff = Math.max(maxScoreDiff, scoreDiff);
    maxFundCountDiff = Math.max(maxFundCountDiff, fundCountDiff);
    maxAumDiff = Math.max(maxAumDiff, aumDiff);

    if (scoreDiff > 0.05 || fundCountDiff >= 1 || aumDiff > 50000) {
      issues.push({
        type: 'value_mismatch',
        crd_number: key,
        base: baseRow,
        materialized: mvRow,
        deltas: {
          activity_score: scoreDiff,
          vc_fund_count: fundCountDiff,
          vc_total_aum: aumDiff
        }
      });
    }
  }

  const countMismatch = baseCount !== mvCount;
  const isStale = countMismatch || issues.length > 0;

  console.log('\nCounts:');
  console.log(`  private_fund_type_by_firm: ${baseCount}`);
  console.log(`  mv_firm_activity:          ${mvCount}`);
  if (countMismatch) {
    console.log('  ⚠️  Count mismatch detected.');
  }

  console.log('\nMax observed differences across sampled rows:');
  console.log(`  activity_score diff: ${maxScoreDiff.toFixed(4)}`);
  console.log(`  vc_fund_count diff: ${maxFundCountDiff}`);
  console.log(`  vc_total_aum diff: $${maxAumDiff.toFixed(2)}`);

  if (issues.length > 0) {
    console.log('\nIssues detected:');
    issues.slice(0, 10).forEach((issue) => {
      if (issue.type === 'value_mismatch') {
        console.log(
          `  - ${issue.type} for CRD ${issue.crd_number}: Δscore=${issue.deltas.activity_score.toFixed(4)}, Δfund_count=${issue.deltas.vc_fund_count}, Δaum=$${issue.deltas.vc_total_aum.toFixed(2)}`
        );
      } else {
        console.log(`  - ${issue.type} for CRD ${issue.crd_number}`);
      }
    });
    if (issues.length > 10) {
      console.log(`  ...and ${issues.length - 10} more.`);
    }
  }

  if (isStale) {
    console.log('\nSTATUS: ⚠️  mv_firm_activity appears stale.');
    console.log('Suggested next steps:');
    console.log('  1. Run with --refresh to rebuild the materialized view.');
    console.log('  2. Re-run this script to confirm the view is in sync.');
    process.exitCode = 2;
  } else {
    console.log('\nSTATUS: ✓ mv_firm_activity matches source view samples.');
  }
}

runChecks().catch((err) => {
  console.error('Unexpected error during mv_firm_activity check:', err.message);
  process.exit(1);
});
