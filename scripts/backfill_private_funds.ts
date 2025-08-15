import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

function loadCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    relax_quotes: true,
    skip_records_with_error: true,
    bom: true,
    escape: '\\',
  })
}

function toBool(v: any): boolean | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim().toUpperCase()
  if (s === 'Y' || s === 'YES' || s === 'TRUE') return true
  if (s === 'N' || s === 'NO' || s === 'FALSE') return false
  return null
}

async function main() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key)

  const root = path.join(process.cwd(), 'raw')
  const folders = fs.readdirSync(root).filter(d => /adv[_-]?filing[_-]?data_/i.test(d)).sort()

  for (const folderName of folders) {
    const folder = path.join(root, folderName)
    const files = fs.readdirSync(folder)
    const baseA = files.find(f => /IA_ADV_Base_A_.*\.csv$/i.test(f))
    const addCRD = files.find(f => /IA_1E2_Additional_CRD_.*\.csv$/i.test(f))
    const sch7b1 = files.find(f => /IA_Schedule_D_7B1_.*\.csv$/i.test(f))
    const sch7b1a28 = files.find(f => /IA_Schedule_D_7B1A28_.*\.csv$/i.test(f))
    if (!sch7b1) { console.warn('No 7B1 in', folder); continue }

    console.log('Processing private funds in', folder)
    const filingToCRD = new Map<string, string>()
    if (addCRD) {
      const crdRows = loadCSV(path.join(folder, addCRD))
      for (const row of crdRows) {
        const filingId = String(row['FilingID'])
        const crd = String(row['CRDNumber'] || '').trim()
        if (crd) filingToCRD.set(filingId, crd)
      }
    }
    // Fallback: derive CRD from Base A if available
    if (baseA && filingToCRD.size === 0) {
      const aRows = loadCSV(path.join(folder, baseA))
      for (const row of aRows) {
        const filingId = String(row['FilingID'])
        const crdMaybe = String(row['1I'] || '').replace(/\D/g, '')
        if (crdMaybe) filingToCRD.set(filingId, crdMaybe)
      }
    }

    const rows7b1 = loadCSV(path.join(folder, sch7b1))
    // Build upserts per filing/reference (dedupe)
    const dedupKey = (r: any) => `${r.crd_number}::${r.filing_id}::${r.reference_id}`
    const byKey: Map<string, any> = new Map()
    for (const r of rows7b1) {
      const filingId = String(r['FilingID'])
      const crd = filingToCRD.get(filingId)
      if (!crd) continue
      const rec: any = {
        crd_number: Number(crd),
        filing_id: Number(filingId),
        reference_id: r['ReferenceID'] ? Number(r['ReferenceID']) : null,
        fund_name: r['Fund Name'] || null,
        fund_id: r['Fund ID'] ? String(r['Fund ID']) : null,
        fund_type: r['Fund Type'] || null,
        fund_type_other: r['Fund Type Other'] || null,
        gross_asset_value: r['Gross Asset Value'] ? Number(String(r['Gross Asset Value']).replace(/,/g, '')) : null,
        min_investment: r['Minimum Investment'] ? Number(String(r['Minimum Investment']).replace(/,/g, '')) : null,
        is_3c1: toBool(r['3(c)(1) Exclusion']),
        is_3c7: toBool(r['3(c)(7) Exclusion']),
        is_master: toBool(r['Master Fund']),
        is_feeder: toBool(r['Feeder Fund']),
        master_fund_name: r['Master Fund Name'] || null,
        master_fund_id: r['Master Fund ID'] ? String(r['Master Fund ID']) : null,
        is_fund_of_funds: toBool(r['Fund of Funds']),
        invested_self_related: toBool(r['Fund Invested Self or Related']),
        invested_securities: toBool(r['Fund Invested in Securities']),
        prime_brokers: r['Prime Brokers'] || null,
        custodians: r['Custodians'] || null,
        administrator: r['Administrator'] || null,
        percent_assets_valued: r['% Assets Valued'] ? Number(r['% Assets Valued']) : null,
        marketing: toBool(r['Marketing']),
        annual_audit: toBool(r['Annual Audit']),
        gaap: toBool(r['GAAP']),
        fs_distributed: toBool(r['FS Distributed']),
        unqualified_opinion: toBool(r['Unqualified Opinion']),
        owners: r['Owners'] ? Number(r['Owners']) : null,
      }
      byKey.set(dedupKey(rec), rec)
    }

    const funds = Array.from(byKey.values())
    for (let i = 0; i < funds.length; i += 500) {
      const batch = funds.slice(i, i + 500)
      const { error } = await supabase.from('ria_private_funds').upsert(batch, { onConflict: 'crd_number,filing_id,reference_id' as any })
      if (error) console.error('Private funds upsert warning:', error.message)
      else console.log(`Upserted private funds ${i + 1}-${i + batch.length}`)
    }

    if (sch7b1a28) {
      const mRows = loadCSV(path.join(folder, sch7b1a28))
      const marketers: any[] = []
      for (const r of mRows) {
        const filingId = String(r['FilingID'])
        const crd = filingToCRD.get(filingId)
        if (!crd) continue
        marketers.push({
          crd_number: Number(crd),
          filing_id: Number(filingId),
          fund_reference_id: r['ReferenceID'] ? Number(r['ReferenceID']) : null,
          related_person: toBool(r['Related Person']) ?? false,
          marketer_name: r['Name of Marketer'] || null,
          marketer_sec_number: r['SEC Number'] || null,
          marketer_crd_number: r['CRD Number'] ? Number(r['CRD Number']) : null,
          city: r['City'] || null,
          state: r['State'] || null,
          country: r['Country'] || null,
          website: r['Websites'] && String(r['Websites']).toUpperCase() !== 'N' ? String(r['Websites']) : null,
        })
      }
      for (let i = 0; i < marketers.length; i += 500) {
        const batch = marketers.slice(i, i + 500)
        const { error } = await supabase.from('ria_fund_marketers').upsert(batch, { onConflict: 'crd_number,filing_id,fund_reference_id,marketer_name' as any })
        if (error) console.error('Fund marketers upsert warning:', error.message)
        else console.log(`Upserted fund marketers ${i + 1}-${i + batch.length}`)
      }
    }
  }

  console.log('✅ Private funds backfill complete')
}

main().catch((e) => { console.error('❌ Backfill failed', e); process.exit(1) })


