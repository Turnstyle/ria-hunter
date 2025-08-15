// Check specific CRDs using public anon key (no server needed)
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzA5NjgsImV4cCI6MjA2MjkwNjk2OH0.mRCFwNzgyrcDsMm6gtLKpwsvwZPe3yunomb36QrOUj4'

const supabase = createClient(url, anonKey)

function listAvailableFields(row) {
  if (!row) return ''
  const keys = Object.keys(row).filter((k) => row[k] !== null && row[k] !== undefined && String(row[k]).length > 0)
  return keys.join(',')
}

async function tryExecutivesCount(crd) {
  try {
    const { count, error } = await supabase
      .from('control_persons')
      .select('*', { head: true, count: 'exact' })
      .eq('crd_number', crd)
    if (error) return null
    return count || 0
  } catch {
    return null
  }
}

async function checkCrd(crd) {
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
  const legalName = row.legal_name || row.firm_name || ''
  const fields = listAvailableFields(row)
  const sample = JSON.stringify(row).slice(0, 200)
  const execCount = await tryExecutivesCount(crd)
  const fieldsWithExec = execCount === null ? fields : (fields ? `${fields},executives_count` : 'executives_count')
  const sampleEsc = sample.replace(/"/g, '\\"')
  const lnEsc = String(legalName).replace(/"/g, '\\"')
  console.log(`CRD ${crd}: EXISTS=Yes, LEGAL_NAME="${lnEsc}", DATA_FIELDS="${fieldsWithExec}", SAMPLE_RESPONSE="${sampleEsc}"`)
}

async function main() {
  const crds = process.argv.slice(2)
  const nums = (crds.length ? crds : ['277', '68', '423']).map((s) => Number(s)).filter((n) => !Number.isNaN(n))
  for (const n of nums) {
    await checkCrd(n)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


