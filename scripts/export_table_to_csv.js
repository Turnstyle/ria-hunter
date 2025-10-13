#!/usr/bin/env node

/**
 * Generic exporter for Supabase tables. Usage:
 *   node scripts/export_table_to_csv.js ria_profiles
 * Optional flags:
 *   --select=col1,col2       (defaults to *)
 *   --order=primary_key      (defaults to crd_number when present)
 *   --batch=2000             (rows per fetch; default 2000)
 *   --output=exports/file.csv (default exports/<table>.csv)
 *   --format=json            (outputs JSONL instead of CSV)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- argument parsing ----------
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/export_table_to_csv.js <table> [--select=col1,col2] [--order=col] [--batch=2000] [--output=path] [--format=json]');
  process.exit(1);
}

const tableName = args[0];
const options = {
  select: '*',
  order: tableName === 'ria_profiles' ? 'crd_number' : undefined,
  batchSize: 2000,
  output: path.join('exports', `${tableName}.csv`),
  format: 'csv'
};

for (const arg of args.slice(1)) {
  if (arg.startsWith('--select=')) {
    options.select = arg.replace('--select=', '').trim();
  } else if (arg.startsWith('--order=')) {
    options.order = arg.replace('--order=', '').trim();
  } else if (arg.startsWith('--batch=')) {
    options.batchSize = parseInt(arg.replace('--batch=', '').trim(), 10) || options.batchSize;
  } else if (arg.startsWith('--output=')) {
    options.output = arg.replace('--output=', '').trim();
  } else if (arg === '--format=json') {
    options.format = 'json';
    if (options.output.endsWith('.csv')) {
      options.output = options.output.replace(/\.csv$/, '.jsonl');
    }
  }
}

// Ensure exports directory exists
fs.mkdirSync(path.dirname(options.output), { recursive: true });

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function writeCsv(rows, stream, headers, isFirstChunk) {
  if (isFirstChunk) {
    stream.write(headers.map(escapeCsvValue).join(',') + '\n');
  }
  for (const row of rows) {
    const line = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        return escapeCsvValue(JSON.stringify(value));
      }
      return escapeCsvValue(value);
    });
    stream.write(line.join(',') + '\n');
  }
}

async function writeJson(rows, stream) {
  for (const row of rows) {
    stream.write(JSON.stringify(row) + '\n');
  }
}

async function exportTable() {
  console.log(`Exporting ${tableName} → ${options.output} (${options.format.toUpperCase()})`);

  const stream = fs.createWriteStream(options.output, { encoding: 'utf8' });
  let total = 0;
  let page = 0;
  let headers = null;
  let hasMore = true;

  try {
    while (hasMore) {
      const from = page * options.batchSize;
      const to = from + options.batchSize - 1;
      let query = supabase.from(tableName).select(options.select, { head: false });
      if (options.order) {
        query = query.order(options.order, { ascending: true, nullsFirst: false });
      }
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      if (!headers) {
        headers = Object.keys(data[0]);
        console.log('Fields:', headers.join(', '));
      }

      if (options.format === 'json') {
        await writeJson(data, stream);
      } else {
        await writeCsv(data, stream, headers, total === 0);
      }

      total += data.length;
      process.stdout.write(`\rFetched ${total} rows...`);

      if (data.length < options.batchSize) {
        hasMore = false;
      } else {
        page += 1;
      }
    }
  } catch (err) {
    console.error('\nExport failed:', err.message);
    stream.close();
    process.exit(1);
  }

  stream.close();
  console.log(`\nExport complete. Total rows: ${total}`);
}

exportTable();

