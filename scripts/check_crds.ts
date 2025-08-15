import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

type ProfileRow = Record<string, any>

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

function listAvailableFields(row: ProfileRow): string {
  if (!row) return ''
  const keys = Object.keys(row).filter((k) => row[k] !== null && row[k] !== undefined && String(row[k]).length > 0)
  return keys.join(',')
}

async function fetchExecutivesCount(crd: number): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('control_persons')
      .select('*', { head: true, count: 'exact' })
      .eq('crd_number', crd)
    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

async function checkCrd(crd: number) {
  const { data, error } = await supabase.from('ria_profiles').select('*').eq('crd_number', crd).limit(1)
  if (error) {
    console.log(`CRD ${crd}: EXISTS=No, REASON="Query error: ${error.message}"`)
    return
  }
  const row = (data && data[0]) || null
  if (!row) {
    console.log(`CRD ${crd}: EXISTS=No, REASON="Not found in database"`)
    return
  }
  const fields = listAvailableFields(row)
  const execCount = await fetchExecutivesCount(crd)
  const legalName = row.legal_name || row.firm_name || ''
  const df = fields ? `${fields},executives_count` : 'executives_count'
  console.log(`CRD ${crd}: EXISTS=Yes, LEGAL_NAME="${String(legalName).replace(/"/g, '\\"')}", DATA_FIELDS="${df}", EXECUTIVES_COUNT=${execCount}`)
}

async function main() {
  const args = process.argv.slice(2)
  const crds = (args.length ? args : ['277', '68', '423']).map((s) => Number(s)).filter((n) => !Number.isNaN(n))
  for (const crd of crds) {
    await checkCrd(crd)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


