import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

type RiaProfile = {
  crd_number: number
  legal_name: string
}

function loadCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'latin1')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    relax_quotes: true,
    bom: true,
    escape: '\\',
  })
}

function discoverBaseAFiles(rawRoot: string): string[] {
  const folders = fs
    .readdirSync(rawRoot)
    .filter((d) => /adv[_-]?filing[_-]?data_/i.test(d) || /^ADV_Filing_Data_/i.test(d))
    .map((d) => path.join(rawRoot, d))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())

  const files: string[] = []
  for (const folder of folders) {
    const found = fs.readdirSync(folder).filter((f) => /IA_ADV_Base_A_.*\.csv$/i.test(f))
    for (const f of found) files.push(path.join(folder, f))
  }
  return files
}

function buildNameToCrdMap(baseAFiles: string[]): Map<string, string> {
  const nameToCrd = new Map<string, string>()
  for (const file of baseAFiles) {
    try {
      const rows = loadCSV(file)
      for (const row of rows) {
        const name = String(row['1A'] || '').trim().toUpperCase()
        const crd = String(row['1E1'] || '').trim()
        if (name && /\d+/.test(crd) && !nameToCrd.has(name)) {
          nameToCrd.set(name, crd)
        }
      }
    } catch (e) {
      console.warn('Warning: failed reading', file, (e as Error).message)
    }
  }
  return nameToCrd
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials. Ensure .env.local is loaded.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const rawRoot = path.join(process.cwd(), 'raw')
  const baseAFiles = discoverBaseAFiles(rawRoot)
  if (baseAFiles.length === 0) {
    console.error('No IA_ADV_Base_A CSV files found under raw/. Aborting.')
    process.exit(1)
  }

  console.log(`Discovered ${baseAFiles.length} Base A files`) 
  const nameToCrd = buildNameToCrdMap(baseAFiles)
  console.log(`Built name→CRD map for ${nameToCrd.size} firms`)

  // Fetch all ria_profiles
  const { data: profiles, error } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name')

  if (error) {
    console.error('Failed to fetch ria_profiles:', error.message)
    process.exit(1)
  }

  const updates: { oldCrd: number; newCrd: number; name: string }[] = []
  for (const p of (profiles || []) as RiaProfile[]) {
    const desired = nameToCrd.get((p.legal_name || '').toUpperCase())
    if (!desired) continue
    const desiredNum = Number(desired)
    if (!Number.isFinite(desiredNum)) continue
    if (desiredNum !== p.crd_number) {
      updates.push({ oldCrd: p.crd_number, newCrd: desiredNum, name: p.legal_name })
    }
  }

  if (updates.length === 0) {
    console.log('No CRD corrections needed.')
    return
  }

  console.log(`Planned ${updates.length} CRD updates. Applying in batches of 500...`)
  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500)
    // Apply sequentially to avoid PK conflicts
    for (const u of batch) {
      const { error: upErr } = await supabase
        .from('ria_profiles')
        .update({ crd_number: u.newCrd })
        .eq('crd_number', u.oldCrd)
      if (upErr) {
        console.error(`Update failed for ${u.name} (${u.oldCrd} -> ${u.newCrd}):`, upErr.message)
      } else {
        console.log(`✓ ${u.name}: ${u.oldCrd} → ${u.newCrd}`)
      }
    }
  }

  console.log('CRD correction complete.')
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})


