#!/usr/bin/env node

/**
 * Normalises the ria_private_funds table:
 *  - Trims/collapses fund_name whitespace
 *  - Standardises fund_type values via synonym mapping + heuristics
 *  - Ensures fund_type_other is only kept when needed
 *  - Reports records missing required identifiers (crd_number, fund_name, fund_type)
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

const FUND_TYPE_SYNONYMS = new Map([
  ['venture capital', 'Venture Capital Fund'],
  ['venture capital fund', 'Venture Capital Fund'],
  ['venture capital funds', 'Venture Capital Fund'],
  ['vc fund', 'Venture Capital Fund'],
  ['vc funds', 'Venture Capital Fund'],
  ['venture capital limited partnership', 'Venture Capital Fund'],
  ['private equity', 'Private Equity Fund'],
  ['private equity fund', 'Private Equity Fund'],
  ['private equity funds', 'Private Equity Fund'],
  ['private equity limited partnership', 'Private Equity Fund'],
  ['hedge', 'Hedge Fund'],
  ['hedge fund', 'Hedge Fund'],
  ['hedge funds', 'Hedge Fund'],
  ['real estate', 'Real Estate Fund'],
  ['real estate fund', 'Real Estate Fund'],
  ['real estate funds', 'Real Estate Fund'],
  ['real estate investment', 'Real Estate Fund'],
  ['fund of funds', 'Fund of Funds'],
  ['fund-of-funds', 'Fund of Funds'],
  ['fund-of-fund', 'Fund of Funds'],
  ['funds of funds', 'Fund of Funds'],
  ['funds-of-funds', 'Fund of Funds'],
  ['other', 'Other'],
  ['others', 'Other'],
  ['unknown', null],
  ['n/a', null],
  ['not applicable', null],
  ['none', null]
]);

const FUND_TYPE_REGEX_FALLBACKS = [
  { regex: /venture/i, value: 'Venture Capital Fund' },
  { regex: /private\s*equity/i, value: 'Private Equity Fund' },
  { regex: /real\s*estate/i, value: 'Real Estate Fund' },
  { regex: /hedge/i, value: 'Hedge Fund' },
  { regex: /fund\s+of\s+funds/i, value: 'Fund of Funds' }
];

const INVALID_FUND_TYPES = new Set([
  '',
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  'not applicable',
  'notavailable',
  'not available',
  'unspecified',
  'tbd',
  't.b.d.'
]);

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeFundName(value) {
  if (value === null || value === undefined) return null;
  const trimmed = collapseWhitespace(String(value));
  if (!trimmed) return null;
  return trimmed
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*,\s*/g, ', ');
}

function normalizeFundType(rawFundType, rawFundTypeOther) {
  const normalizedOther = rawFundTypeOther ? collapseWhitespace(String(rawFundTypeOther)) : null;
  if (rawFundType === null || rawFundType === undefined) {
    if (normalizedOther) {
      return { fundType: 'Other', fundTypeOther: normalizedOther, flags: { usedOtherFallback: true } };
    }
    return { fundType: null, fundTypeOther: null, flags: { missing: true } };
  }

  const collapsed = collapseWhitespace(String(rawFundType));
  if (!collapsed) {
    if (normalizedOther) {
      return { fundType: 'Other', fundTypeOther: normalizedOther, flags: { usedOtherFallback: true } };
    }
    return { fundType: null, fundTypeOther: null, flags: { missing: true } };
  }

  const lower = collapsed.toLowerCase();
  if (INVALID_FUND_TYPES.has(lower)) {
    if (normalizedOther) {
      return { fundType: 'Other', fundTypeOther: normalizedOther, flags: { usedOtherFallback: true } };
    }
    return { fundType: null, fundTypeOther: null, flags: { invalid: true } };
  }

  if (FUND_TYPE_SYNONYMS.has(lower)) {
    const canonical = FUND_TYPE_SYNONYMS.get(lower);
    if (canonical === null) {
      if (normalizedOther) {
        return { fundType: 'Other', fundTypeOther: normalizedOther, flags: { usedOtherFallback: true } };
      }
      return { fundType: null, fundTypeOther: null, flags: { invalid: true } };
    }
    const shouldKeepOther = canonical === 'Other' ? normalizedOther : null;
    return { fundType: canonical, fundTypeOther: shouldKeepOther, flags: { synonymHit: true } };
  }

  for (const { regex, value } of FUND_TYPE_REGEX_FALLBACKS) {
    if (regex.test(collapsed)) {
      return { fundType: value, fundTypeOther: null, flags: { regexHit: true } };
    }
  }

  const canonical = collapsed
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (word.toUpperCase() === word) {
        // Preserve acronyms like LP, LLC, ETF
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return { fundType: canonical, fundTypeOther: normalizedOther, flags: { titleCased: true } };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function run() {
  const pageSize = 500;
  let from = 0;
  let totalRows = 0;
  const updates = [];
  const stats = {
    scanned: 0,
    updates: 0,
    namesTrimmed: 0,
    fundTypesMapped: 0,
    fundTypesRegex: 0,
    fundTypesTitleCase: 0,
    fundTypesOtherFallback: 0,
    fundTypeOtherCleared: 0,
    missingCrd: [],
    missingFundName: [],
    missingFundType: []
  };

  console.log('Starting ria_private_funds normalisation...');

  while (true) {
    const { data, error, count } = await supabase
      .from('ria_private_funds')
      .select('id, crd_number, fund_name, fund_type, fund_type_other', { count: from === 0 ? 'exact' : undefined })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching ria_private_funds:', error.message);
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
      const update = { id: row.id, crd_number: row.crd_number };
      let hasChanges = false;

      if (!row.crd_number) {
        if (stats.missingCrd.length < 20) {
          stats.missingCrd.push({ id: row.id, fund_name: row.fund_name });
        }
      }

      const normalizedName = normalizeFundName(row.fund_name);
      if (!normalizedName) {
        if (stats.missingFundName.length < 20) {
          stats.missingFundName.push({ id: row.id, crd_number: row.crd_number });
        }
      }
      if (normalizedName !== row.fund_name) {
        update.fund_name = normalizedName;
        hasChanges = true;
        stats.namesTrimmed += 1;
      }

      const { fundType, fundTypeOther, flags } = normalizeFundType(row.fund_type, row.fund_type_other);

      if (!fundType) {
        if (stats.missingFundType.length < 20) {
          stats.missingFundType.push({ id: row.id, crd_number: row.crd_number, fund_type_other: row.fund_type_other });
        }
      }

      if (fundType !== row.fund_type) {
        update.fund_type = fundType;
        hasChanges = true;
        if (flags.synonymHit) stats.fundTypesMapped += 1;
        if (flags.regexHit) stats.fundTypesRegex += 1;
        if (flags.titleCased) stats.fundTypesTitleCase += 1;
        if (flags.usedOtherFallback) stats.fundTypesOtherFallback += 1;
      }

      const cleanedOther = fundTypeOther === undefined ? row.fund_type_other : fundTypeOther;
      if (cleanedOther !== row.fund_type_other) {
        update.fund_type_other = cleanedOther;
        hasChanges = true;
        if (!cleanedOther) {
          stats.fundTypeOtherCleared += 1;
        }
      }

      if (hasChanges) {
        if (!row.crd_number) {
          continue; // Skip updates that would violate not-null constraint; record already flagged above
        }
        updates.push(update);
      }
    }

    from += data.length;
  }

  if (updates.length > 0) {
    console.log(`Applying ${updates.length} updates to ria_private_funds...`);
    const batches = chunk(updates, 100);
    for (const batch of batches) {
      const { error: updateError } = await supabase
        .from('ria_private_funds')
        .upsert(batch, { onConflict: 'id' });
      if (updateError) {
        console.error('Failed to update ria_private_funds batch:', updateError.message);
        process.exit(1);
      }
    }
    stats.updates = updates.length;
  } else {
    console.log('No updates required for ria_private_funds.');
  }

  console.log('\nNormalization summary:');
  console.log(`  Rows scanned: ${stats.scanned}${totalRows ? ` / ${totalRows}` : ''}`);
  console.log(`  Rows updated: ${stats.updates}`);
  console.log(`  Fund names normalised: ${stats.namesTrimmed}`);
  console.log(`  Fund types via synonym map: ${stats.fundTypesMapped}`);
  console.log(`  Fund types via regex heuristic: ${stats.fundTypesRegex}`);
  console.log(`  Fund types title-cased: ${stats.fundTypesTitleCase}`);
  console.log(`  Fallback to 'Other' using fund_type_other: ${stats.fundTypesOtherFallback}`);
  console.log(`  Cleared fund_type_other noise: ${stats.fundTypeOtherCleared}`);

  if (stats.missingCrd.length > 0) {
    console.log('\n⚠️  Records missing crd_number (first 20):');
    stats.missingCrd.forEach((row) => {
      console.log(`   - id=${row.id}, fund_name=${row.fund_name || 'NULL'}`);
    });
  }

  if (stats.missingFundName.length > 0) {
    console.log('\n⚠️  Records missing fund_name (first 20):');
    stats.missingFundName.forEach((row) => {
      console.log(`   - id=${row.id}, crd_number=${row.crd_number || 'NULL'}`);
    });
  }

  if (stats.missingFundType.length > 0) {
    console.log('\n⚠️  Records missing fund_type (first 20):');
    stats.missingFundType.forEach((row) => {
      console.log(`   - id=${row.id}, crd_number=${row.crd_number || 'NULL'}, fund_type_other=${row.fund_type_other || 'NULL'}`);
    });
    process.exitCode = 2; // Signal that manual follow-up is required
  }

  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Unexpected error during ria_private_funds normalization:', err);
  process.exit(1);
});
