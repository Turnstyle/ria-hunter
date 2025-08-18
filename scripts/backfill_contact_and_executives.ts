import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

type Contacts = {
  filingId: string
  crdNumber?: string
  phone?: string
  fax?: string
  website?: string
}

type Executive = {
  filingId: string
  name: string
  title?: string
}

function loadCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  })
}

function normalizePhone(input?: string): string | undefined {
  if (!input) return undefined
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return input
}

function normalizeWebsite(input?: string): string | undefined {
  if (!input) return undefined
  const t = input.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t.replace(/^\/*/, '')}`
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')
  const supabase = createClient(url, key)

  // Prefer raw/ if present; otherwise fall back to public/raw_data
  const rawRoot = path.join(process.cwd(), 'raw')
  const pubRoot = path.join(process.cwd(), 'public', 'raw_data')
  const root = fs.existsSync(rawRoot) ? rawRoot : pubRoot
  const dirnames = fs.readdirSync(root)
  const folders = dirnames.filter(d => /adv[_-]?filing[_-]?data_/i.test(d)).sort()
  // Include older hyphenated lowercase ranges (e.g., adv-filing-data-20240901-20240930)
  // Already matched by the same regex; ensure sort by date ascending
  folders.sort((a, b) => {
    const da = (a.match(/(20\d{6})/) || [,'00000000'])[1]
    const db = (b.match(/(20\d{6})/) || [,'00000000'])[1]
    return Number(da) - Number(db)
  })
  if (folders.length === 0) throw new Error('No ADV folders found in raw/')

  const processedCrds = new Set<number>()
  const processedExecKey = new Set<string>()

  for (const folderName of folders) {
    const folder = path.join(root, folderName)
    console.log('Using data folder:', folder)

    // Files
    const baseA = fs.readdirSync(folder).find(f => /IA_ADV_Base_A_.*\.csv$/i.test(f)) ? path.join(folder, fs.readdirSync(folder).find(f => /IA_ADV_Base_A_.*\.csv$/i.test(f))!) : ''
    const scheduleA = fs.readdirSync(folder).find(f => /IA_Schedule_A_B_.*\.csv$/i.test(f)) ? path.join(folder, fs.readdirSync(folder).find(f => /IA_Schedule_A_B_.*\.csv$/i.test(f))!) : ''
    const addCRD = fs.readdirSync(folder).find(f => /IA_1E2_Additional_CRD_.*\.csv$/i.test(f)) ? path.join(folder, fs.readdirSync(folder).find(f => /IA_1E2_Additional_CRD_.*\.csv$/i.test(f))!) : ''
    const websitesFile = fs.readdirSync(folder).find(f => /IA_Schedule_D_7B1A28_websites_.*\.csv$/i.test(f)) ? path.join(folder, fs.readdirSync(folder).find(f => /IA_Schedule_D_7B1A28_websites_.*\.csv$/i.test(f))!) : ''

    if (!baseA) { console.warn('Skipping: IA_ADV_Base_A*.csv not found in', folder); continue }

    console.log('Loading Base A...')
    const baseRows = loadCSV(baseA)

    // Map filingId -> contacts
    const filingToContacts = new Map<string, Contacts>()
    for (const row of baseRows) {
      const filingId = String(row['FilingID'])
      const phone = row['1J-Phone'] || row['Reg Contact-Phone'] || row['Reg Contact Phone'] || row['Primary Business Phone Number']
      const fax = row['1J-Fax'] || row['Reg Contact-Fax'] || row['Reg Contact Fax']
      const websiteCandidate = row['Firm Website'] || row['Website'] || row['Firm Website Address']
      filingToContacts.set(filingId, {
        filingId,
        phone: normalizePhone(String(phone || '').trim() || undefined),
        fax: normalizePhone(String(fax || '').trim() || undefined),
        website: normalizeWebsite(websiteCandidate),
      })
    }

    if (websitesFile) {
      console.log('Loading websites...')
      const wsRows = loadCSV(websitesFile)
      for (const row of wsRows) {
        const filingId = String(row['FilingID'])
        const w = String(row['Website Address'] || '').trim()
        if (!w) continue
        const c = filingToContacts.get(filingId) || { filingId }
        c.website = normalizeWebsite(w.toLowerCase())
        filingToContacts.set(filingId, c as Contacts)
      }
    }

    // FilingID -> CRD
    const filingToCRD = new Map<string, string>()
    if (addCRD) {
      console.log('Loading additional CRD mapping...')
      const crdRows = loadCSV(addCRD)
      for (const row of crdRows) {
        const filingId = String(row['FilingID'])
        const crd = String(row['CRDNumber'] || '').trim()
        if (crd) filingToCRD.set(filingId, crd)
      }
    }

    // Fallback: derive CRD directly from Base A when Additional_CRD file missing or incomplete
    for (const row of baseRows) {
      const filingId = String(row['FilingID'])
      const crdRaw = String(
        row['CRD Number'] || row['CRDNumber'] || row['1E1'] || row['1E1-CRD Number'] || row['CRD'] || ''
      ).trim()
      if (crdRaw && !filingToCRD.has(filingId)) filingToCRD.set(filingId, crdRaw)
    }

    // Executives from Schedule A/B
    const executives: Executive[] = []
    if (scheduleA) {
      console.log('Loading Schedule A/B (executives)...')
      const aRows = loadCSV(scheduleA)
      for (const row of aRows) {
        const filingId = String(row['FilingID'])
        const fullName = String(row['Full Legal Name'] || '').trim()
        if (!fullName) continue
        const title = String(row['Title or Status'] || '').trim() || undefined
        executives.push({ filingId, name: fullName, title })
      }
    }

    console.log('Assembling upserts...')
    // De-duplicate per CRD within the month; prefer rows that have more fields populated
    const crdToContact: Map<number, any> = new Map()
    for (const [filingId, c] of filingToContacts.entries()) {
      const crd = filingToCRD.get(filingId)
      if (!crd) continue
      const crdNum = Number(crd)
      if (processedCrds.has(crdNum)) continue
      const candidate: any = { crd_number: crdNum }
      if (c.phone) candidate.phone = c.phone
      if (c.fax) candidate.fax = c.fax
      if (c.website) candidate.website = c.website
      if (Object.keys(candidate).length <= 1) continue
      const existing = crdToContact.get(crdNum)
      if (!existing) {
        crdToContact.set(crdNum, candidate)
      } else {
        const score = (o: any) => Number(!!o.phone) + Number(!!o.fax) + Number(!!o.website)
        if (score(candidate) > score(existing)) crdToContact.set(crdNum, candidate)
      }
    }
    const profileUpdates: any[] = Array.from(crdToContact.values())

    console.log(`Prepared ${profileUpdates.length} profile updates`)
    for (let i = 0; i < profileUpdates.length; i += 500) {
      const batch = profileUpdates.slice(i, i + 500)
      const { error } = await supabase.from('ria_profiles').upsert(batch, { onConflict: 'crd_number' })
      if (error) console.error('Profile upsert error:', error.message)
      else {
        for (const r of batch) processedCrds.add(r.crd_number)
        console.log(`Upserted profiles ${i + 1} - ${i + batch.length}`)
      }
    }

    // Detect optional column 'filing_fk' on control_persons (do once)
    let hasFilingFk = false
    try {
      const probe = await supabase.from('control_persons').select('filing_fk').limit(1)
      if (!probe.error) hasFilingFk = true
    } catch {}

    const execInserts: any[] = []
    const crdToExecs: Map<number, { name: string, title?: string | null }[]> = new Map()
    for (const e of executives) {
      const crd = filingToCRD.get(e.filingId)
      if (!crd) continue
      const crdNum = Number(crd)
      const key = `${crdNum}::${e.name}::${e.title || ''}`
      if (processedExecKey.has(key)) continue
      // Insert using adviser_id and name to match production schema
      // Some environments may also accept person_name, but 'name' exists in prod
      const base: any = { adviser_id: crdNum, name: e.name, title: e.title || null }
      if (hasFilingFk) base.filing_fk = null
      execInserts.push(base)
      processedExecKey.add(key)

      // Aggregate for executives_by_firm
      const list = crdToExecs.get(crdNum) || []
      list.push({ name: e.name, title: e.title || null })
      crdToExecs.set(crdNum, list)
    }

    console.log(`Prepared ${execInserts.length} control_person records`)
    // Ensure all CRDs referenced by execs exist in ria_profiles; create minimal rows if missing
    if (execInserts.length > 0) {
      const execCrds = Array.from(new Set(execInserts.map(r => r.adviser_id)))
      // Chunk query to avoid URL length issues
        const missing: number[] = []
      for (let i = 0; i < execCrds.length; i += 1000) {
        const chunk = execCrds.slice(i, i + 1000)
        const { data, error } = await supabase
          .from('ria_profiles')
          .select('crd_number')
          .in('crd_number', chunk)
        if (!error) {
          const have = new Set<number>((data || []).map((d: any) => Number(d.crd_number)))
          for (const n of chunk) if (!have.has(n)) missing.push(n)
        }
      }
      if (missing.length > 0) {
        const placeholders = missing.map(n => ({ crd_number: n }))
        for (let i = 0; i < placeholders.length; i += 500) {
          const batch = placeholders.slice(i, i + 500)
          const { error } = await supabase.from('ria_profiles').insert(batch)
          if (error) console.warn('Placeholder ria_profiles insert warning:', error.message)
        }
      }
    }
    for (let i = 0; i < execInserts.length; i += 500) {
      const batch = execInserts.slice(i, i + 500)
      const { error } = await supabase.from('control_persons').insert(batch)
      if (error) console.error('Executives insert warning (control_persons):', error.message || JSON.stringify(error))
      else console.log(`Inserted executives ${i + 1} - ${i + batch.length} into control_persons`)
    }

    // Upsert executives_by_firm from aggregated map
    if (crdToExecs.size > 0) {
      const crds = Array.from(crdToExecs.keys())
      // Fetch legal names for CRDs
      const crdNameMap: Map<number, string> = new Map()
      for (let i = 0; i < crds.length; i += 1000) {
        const chunk = crds.slice(i, i + 1000)
        const { data, error } = await supabase
          .from('ria_profiles')
          .select('crd_number, legal_name')
          .in('crd_number', chunk)
        if (error) console.warn('ria_profiles lookup warning:', error.message)
        else {
          for (const row of data || []) {
            crdNameMap.set(Number(row.crd_number), row.legal_name as string)
          }
        }
      }
      const ebfRows = crds.map(crd => ({
        crd_number: crd,
        executives: crdToExecs.get(crd) || [],
      }))
      for (let i = 0; i < ebfRows.length; i += 500) {
        const batch = ebfRows.slice(i, i + 500)
        const { error } = await supabase
          .from('executives_by_firm_manual')
          .upsert(batch, { onConflict: 'crd_number' })
        if (error) console.error('executives_by_firm_manual upsert warning:', error.message || JSON.stringify(error))
        else console.log(`Upserted executives_by_firm_manual ${i + 1} - ${i + batch.length}`)
      }
    }
  }

  console.log('✅ Backfill complete')
}

main().catch((e) => { console.error('❌ Backfill failed', e); process.exit(1) })


