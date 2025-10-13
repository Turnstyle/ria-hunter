#!/usr/bin/env node

/**
 * Cleans the control_persons table by:
 *  - Trimming/collapsing whitespace in person_name and title fields
 *  - Normalising casing for names and titles while preserving common acronyms
 *  - Clearing obviously blank titles (e.g., 'N/A')
 *  - Removing duplicate rows that share the same crd_number, person_name, and title
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const NAME_UPPER_TOKENS = new Set(['III', 'II', 'IV', 'JR', 'JR.', 'SR', 'SR.', 'CPA', 'CFP', 'RIA']);
const TITLE_UPPER_TOKENS = new Set([
  'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CMO', 'CPO', 'CISO', 'GC', 'EVP', 'SVP', 'VP', 'MD', 'CPA', 'CFP', 'RIA',
  'CO-FOUNDER', 'COFOUNDER', 'FOUNDER', 'CHAIRMAN'
]);
const TITLE_LOWER_WORDS = new Set(['and', 'of', 'for', 'the']);
const INVALID_TITLES = new Set(['', 'n/a', 'na', 'none', 'null', 'unknown', 'not applicable', 'tbd']);

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function titleCaseWord(word) {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (NAME_UPPER_TOKENS.has(upper)) {
    return upper;
  }
  if (word.includes('-')) {
    return word
      .split('-')
      .map((segment) => titleCaseWord(segment))
      .join('-');
  }
  if (word.includes("'")) {
    return word
      .split("'")
      .map((segment, idx) => (idx === 0 ? titleCaseWord(segment) : segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : segment))
      .join("'");
  }
  if (word.length === 1) {
    return word.toUpperCase();
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizePersonName(value) {
  if (value === null || value === undefined) return null;
  const trimmed = collapseWhitespace(String(value)).replace(/,+$/, '');
  if (!trimmed) return null;
  return trimmed
    .split(' ')
    .map((part) => titleCaseWord(part))
    .join(' ');
}

function normalizeTitle(value) {
  if (value === null || value === undefined) return null;
  const trimmed = collapseWhitespace(String(value)).replace(/\.+$/, '');
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (INVALID_TITLES.has(lower)) {
    return null;
  }

  return trimmed
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (part === '&') return '&';
      const upper = part.toUpperCase();
      if (TITLE_UPPER_TOKENS.has(upper)) {
        return upper;
      }
      const lowerPart = part.toLowerCase();
      if (TITLE_LOWER_WORDS.has(lowerPart)) {
        return lowerPart;
      }
      if (part.includes('/')) {
        return part
          .split('/')
          .map((segment) => normalizeTitle(segment))
          .join('/');
      }
      if (part.includes('-')) {
        return part
          .split('-')
          .map((segment) => normalizeTitle(segment))
          .join('-');
      }
      if (part.includes("'")) {
        return part
          .split("'")
          .map((segment, idx) => {
            if (!segment) return segment;
            if (idx === 0) {
              return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
            }
            return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
          })
          .join("'");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function toMillis(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

async function run() {
  const pageSize = 1000;
  let from = 0;
  let totalRows = 0;

  const updatesMap = new Map();
  const duplicateTracker = new Map();
  const duplicatesToDelete = new Set();

  const stats = {
    scanned: 0,
    updated: 0,
    namesNormalised: 0,
    titlesNormalised: 0,
    titlesCleared: 0,
    duplicatesRemoved: 0,
    missingCrd: [],
    missingName: [],
    blankTitle: []
  };

  console.log('Starting control_persons cleanup...');

  while (true) {
    const { data, error, count } = await supabase
      .from('control_persons')
      .select('control_person_pk, crd_number, person_name, title, created_at', { count: from === 0 ? 'exact' : undefined })
      .order('control_person_pk', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching control_persons:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      break;
    }

    if (typeof count === 'number') {
      totalRows = count;
    }

    stats.scanned += data.length;

    for (const row of data) {
      const update = { control_person_pk: row.control_person_pk, crd_number: row.crd_number };
      let hasChanges = false;

      if (!row.crd_number) {
        if (stats.missingCrd.length < 20) {
          stats.missingCrd.push({ id: row.control_person_pk, person_name: row.person_name });
        }
      }

      const normalizedName = normalizePersonName(row.person_name);
      if (!normalizedName) {
        if (stats.missingName.length < 20) {
          stats.missingName.push({ id: row.control_person_pk, crd_number: row.crd_number });
        }
      }

      if (normalizedName !== row.person_name) {
        update.person_name = normalizedName;
        hasChanges = true;
        stats.namesNormalised += 1;
      }

      const normalizedTitle = normalizeTitle(row.title);
      if (!normalizedTitle) {
        if (stats.blankTitle.length < 20) {
          stats.blankTitle.push({ id: row.control_person_pk, crd_number: row.crd_number, person_name: normalizedName || row.person_name });
        }
      }

      if (normalizedTitle !== row.title) {
        update.title = normalizedTitle;
        hasChanges = true;
        if (normalizedTitle === null) {
          stats.titlesCleared += 1;
        } else {
          stats.titlesNormalised += 1;
        }
      }

      // Duplicate detection only when we have key fields
      const crdKey = row.crd_number ? String(row.crd_number).trim() : '';
      const nameKey = normalizedName ? normalizedName.toLowerCase() : '';
      const titleKey = normalizedTitle ? normalizedTitle.toLowerCase() : 'no-title';

      if (crdKey && nameKey) {
        const dedupeKey = `${crdKey}::${nameKey}::${titleKey}`;
        const existing = duplicateTracker.get(dedupeKey);
        if (existing) {
          const existingMillis = toMillis(existing.created_at);
          const currentMillis = toMillis(row.created_at);
          if (currentMillis < existingMillis) {
            duplicatesToDelete.add(existing.control_person_pk);
            duplicateTracker.set(dedupeKey, { control_person_pk: row.control_person_pk, created_at: row.created_at });
            updatesMap.delete(existing.control_person_pk);
          } else {
            duplicatesToDelete.add(row.control_person_pk);
            updatesMap.delete(row.control_person_pk);
            continue; // Skip writing updates for rows we plan to delete
          }
        } else {
          duplicateTracker.set(dedupeKey, { control_person_pk: row.control_person_pk, created_at: row.created_at });
        }
      }

      if (hasChanges) {
        if (!row.crd_number) {
          continue; // Skip updates that would violate not-null constraint
        }
        updatesMap.set(row.control_person_pk, update);
      } else {
        updatesMap.delete(row.control_person_pk);
      }
    }

    from += data.length;
  }

  const updates = Array.from(updatesMap.values());

  if (updates.length > 0) {
    console.log(`Applying ${updates.length} updates to control_persons...`);
    const batches = chunk(updates, 100);
    for (const batch of batches) {
      const { error: updateError } = await supabase
        .from('control_persons')
        .upsert(batch, { onConflict: 'control_person_pk' });
      if (updateError) {
        console.error('Failed to update control_persons batch:', updateError.message);
        process.exit(1);
      }
    }
    stats.updated = updates.length;
  } else {
    console.log('No updates required for control_persons fields.');
  }

  if (duplicatesToDelete.size > 0) {
    console.log(`Removing ${duplicatesToDelete.size} duplicate control_persons rows...`);
    const dedupeBatches = chunk(Array.from(duplicatesToDelete), 200);
    for (const batch of dedupeBatches) {
      const { error: deleteError } = await supabase
        .from('control_persons')
        .delete()
        .in('control_person_pk', batch);
      if (deleteError) {
        console.error('Failed to delete duplicate control_persons rows:', deleteError.message);
        process.exit(1);
      }
    }
    stats.duplicatesRemoved = duplicatesToDelete.size;
  }

  console.log('\nCleanup summary:');
  console.log(`  Rows scanned: ${stats.scanned}${totalRows ? ` / ${totalRows}` : ''}`);
  console.log(`  Rows updated: ${stats.updated}`);
  console.log(`  Names normalised: ${stats.namesNormalised}`);
  console.log(`  Titles normalised: ${stats.titlesNormalised}`);
  console.log(`  Titles cleared: ${stats.titlesCleared}`);
  console.log(`  Duplicate rows removed: ${stats.duplicatesRemoved}`);

  if (stats.missingCrd.length > 0) {
    console.log('\n⚠️  Records missing crd_number (first 20):');
    stats.missingCrd.forEach((row) => {
      console.log(`   - id=${row.id}, person_name=${row.person_name || 'NULL'}`);
    });
  }

  if (stats.missingName.length > 0) {
    console.log('\n⚠️  Records missing person_name (first 20):');
    stats.missingName.forEach((row) => {
      console.log(`   - id=${row.id}, crd_number=${row.crd_number || 'NULL'}`);
    });
    process.exitCode = 2; // signal manual follow-up
  }

  if (stats.blankTitle.length > 0) {
    console.log('\n⚠️  Records with blank/invalid titles (first 20):');
    stats.blankTitle.forEach((row) => {
      console.log(`   - id=${row.id}, crd_number=${row.crd_number || 'NULL'}, person_name=${row.person_name || 'NULL'}`);
    });
  }

  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Unexpected error during control_persons cleanup:', err);
  process.exit(1);
});
