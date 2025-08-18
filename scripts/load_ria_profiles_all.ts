import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

type ProfileRow = {
  crd_number?: string | number | null
  firm_name?: string | null
  city?: string | null
  state?: string | null
  aum?: string | number | null
  zip_code?: string | null
  address?: string | null
  employee_count?: string | number | null
  form_adv_date?: string | null
}

function loadCSV(filePath: string): ProfileRow[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as ProfileRow[]
}

function toNumber(n: any): number | null {
  if (n === undefined || n === null) return null
  const s = String(n).replace(/[,\s]/g, '')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const csvPathCandidates = [
    path.join(process.cwd(), 'output', 'ria_profiles.csv'),
    path.join(process.cwd(), 'seed', 'ria_profiles.csv'),
  ]
  const csvPath = csvPathCandidates.find((p) => fs.existsSync(p))
  if (!csvPath) {
    console.error('Could not find output/ria_profiles.csv or seed/ria_profiles.csv')
    process.exit(1)
  }

  console.log('Loading CSV:', csvPath)
  const rows = loadCSV(csvPath)
  console.log(`Loaded ${rows.length} rows`)

  // Prepare upserts. Use synthetic CRDs starting at 900000 for rows missing CRD
  const prepared = rows.map((row, idx) => {
    const rawCrd = row.crd_number
    const digits = rawCrd !== null && rawCrd !== undefined ? String(rawCrd).replace(/\D/g, '') : ''
    const crd = digits ? Number(digits) : 900000 + idx + 1
    return {
      crd_number: crd,
      legal_name: row.firm_name || null,
      city: row.city || null,
      state: row.state || null,
      aum: toNumber(row.aum),
      form_adv_date: row.form_adv_date || null,
    } as any
  })

  // Chunked upsert
  const batchSize = 1000
  let total = 0
  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = prepared.slice(i, i + batchSize)
    const { error } = await supabase.from('ria_profiles').upsert(batch as any, { onConflict: 'crd_number' })
    if (error) {
      console.error(`Upsert batch ${i + 1}-${i + batch.length} error:`, error.message)
    } else {
      total += batch.length
      console.log(`Upserted ${total}/${prepared.length}`)
    }
  }

  console.log('✅ Completed upsert to public.ria_profiles')
}

main().catch((e) => {
  console.error('❌ Loader failed:', e)
  process.exit(1)
})


