#!/usr/bin/env node

/**
 * Normalizes key fields in the ria_profiles table:
 *  - State abbreviations (trims whitespace, maps full names -> USPS codes, uppercases, nulls invalid)
 *  - City names (trims and title-cases when data is all uppercase)
 *  - Phone/Fax (strips punctuation, converts to E.164 +1 format where possible)
 *  - Website URLs (trims, prepends https:// when missing)
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env.local if available
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STATE_MAP = new Map([
  ['ALABAMA', 'AL'],
  ['ALASKA', 'AK'],
  ['ARIZONA', 'AZ'],
  ['ARKANSAS', 'AR'],
  ['CALIFORNIA', 'CA'],
  ['COLORADO', 'CO'],
  ['CONNECTICUT', 'CT'],
  ['DELAWARE', 'DE'],
  ['DISTRICT OF COLUMBIA', 'DC'],
  ['WASHINGTON DC', 'DC'],
  ['FLORIDA', 'FL'],
  ['GEORGIA', 'GA'],
  ['HAWAII', 'HI'],
  ['IDAHO', 'ID'],
  ['ILLINOIS', 'IL'],
  ['INDIANA', 'IN'],
  ['IOWA', 'IA'],
  ['KANSAS', 'KS'],
  ['KENTUCKY', 'KY'],
  ['LOUISIANA', 'LA'],
  ['MAINE', 'ME'],
  ['MARYLAND', 'MD'],
  ['MASSACHUSETTS', 'MA'],
  ['MICHIGAN', 'MI'],
  ['MINNESOTA', 'MN'],
  ['MISSISSIPPI', 'MS'],
  ['MISSOURI', 'MO'],
  ['MONTANA', 'MT'],
  ['NEBRASKA', 'NE'],
  ['NEVADA', 'NV'],
  ['NEW HAMPSHIRE', 'NH'],
  ['NEW JERSEY', 'NJ'],
  ['NEW MEXICO', 'NM'],
  ['NEW YORK', 'NY'],
  ['NORTH CAROLINA', 'NC'],
  ['NORTH DAKOTA', 'ND'],
  ['OHIO', 'OH'],
  ['OKLAHOMA', 'OK'],
  ['OREGON', 'OR'],
  ['PENNSYLVANIA', 'PA'],
  ['RHODE ISLAND', 'RI'],
  ['SOUTH CAROLINA', 'SC'],
  ['SOUTH DAKOTA', 'SD'],
  ['TENNESSEE', 'TN'],
  ['TEXAS', 'TX'],
  ['UTAH', 'UT'],
  ['VERMONT', 'VT'],
  ['VIRGINIA', 'VA'],
  ['WASHINGTON', 'WA'],
  ['WEST VIRGINIA', 'WV'],
  ['WISCONSIN', 'WI'],
  ['WYOMING', 'WY']
]);

function normalizeState(value) {
  if (!value) return null;
  let trimmed = value.trim();
  if (!trimmed) return null;
  // Remove punctuation/spaces between letters (e.g., "N. Y." -> "NY")
  const cleanedAlpha = trimmed.replace(/[^a-zA-Z]/g, '');
  if (cleanedAlpha.length === 2) {
    return cleanedAlpha.toUpperCase();
  }
  const upper = trimmed.toUpperCase();
  if (STATE_MAP.has(upper)) {
    return STATE_MAP.get(upper);
  }
  if (STATE_MAP.has(cleanedAlpha.toUpperCase())) {
    return STATE_MAP.get(cleanedAlpha.toUpperCase());
  }
  // If already a two-letter uppercase code, keep it
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }
  return null;
}

function isAllUpper(str) {
  return str === str.toUpperCase();
}

function titleCaseCity(city) {
  return city
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Mc)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
}

function normalizeCity(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isAllUpper(trimmed)) {
    return titleCaseCity(trimmed);
  }
  return trimmed;
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length >= 11) {
    return `+${digits}`;
  }
  return null;
}

function normalizeWebsite(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function run() {
  const pageSize = 1000;
  let from = 0;
  let totalProcessed = 0;
  let totalUpdates = 0;
  const fieldCounts = { state: 0, city: 0, phone: 0, fax: 0, website: 0 };

  console.log('Starting normalization pass over ria_profiles...');

  while (true) {
    const to = from + pageSize - 1;
   const { data, error } = await supabase
     .from('ria_profiles')
     .select('crd_number, state, city, phone, fax, website')
      .order('crd_number', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Fetch error:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      break;
    }

    totalProcessed += data.length;

    const updates = [];

    for (const row of data) {
      const normalizedState = normalizeState(row.state);
      const normalizedCity = normalizeCity(row.city);
      const normalizedPhone = normalizePhone(row.phone);
      const normalizedFax = normalizePhone(row.fax);
      const normalizedWebsite = normalizeWebsite(row.website);

      const needsUpdate =
        normalizedState !== (row.state || null) ||
        normalizedCity !== (row.city || null) ||
        normalizedPhone !== (row.phone || null) ||
        normalizedFax !== (row.fax || null) ||
        normalizedWebsite !== (row.website || null);

      if (needsUpdate) {
        const payload = {
          crd_number: row.crd_number,
          state: normalizedState,
          city: normalizedCity,
          phone: normalizedPhone,
          fax: normalizedFax,
          website: normalizedWebsite,
        };

        updates.push(payload);

        if (normalizedState !== (row.state || null)) fieldCounts.state++;
        if (normalizedCity !== (row.city || null)) fieldCounts.city++;
        if (normalizedPhone !== (row.phone || null)) fieldCounts.phone++;
        if (normalizedFax !== (row.fax || null)) fieldCounts.fax++;
        if (normalizedWebsite !== (row.website || null)) fieldCounts.website++;
      }
    }

    if (updates.length) {
      totalUpdates += updates.length;
      const chunkSize = 500;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const { error: upsertError } = await supabase
          .from('ria_profiles')
          .upsert(chunk, { onConflict: 'crd_number' });
        if (upsertError) {
          console.error('Upsert error:', upsertError);
          process.exit(1);
        }
      }
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  console.log('Normalization complete.');
  console.log('Rows processed:', totalProcessed);
  console.log('Rows updated:', totalUpdates);
  console.log('Field changes:', fieldCounts);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
