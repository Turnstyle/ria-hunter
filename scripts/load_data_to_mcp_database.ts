#!/usr/bin/env npx tsx

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

// Use the correct RIA Hunter production database
const supabaseUrl = process.env.SUPABASE_URL || 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

type ProfileRow = {
  crd_number?: string | number | null
  firm_name?: string | null
  city?: string | null
  state?: string | null
  aum?: string | number | null
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
  console.log('🚀 Loading data to MCP tools database...\n')
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const csvPath = path.join(process.cwd(), 'output', 'ria_profiles.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('Could not find output/ria_profiles.csv')
    process.exit(1)
  }

  console.log('Loading CSV:', csvPath)
  const rows = loadCSV(csvPath)
  console.log(`Loaded ${rows.length} rows`)

  // Clear existing fake data first
  console.log('Clearing existing test data...')
  await supabase.from('ria_profiles').delete().gte('crd_number', 999001).lte('crd_number', 999019)

  // Prepare profiles - assign synthetic CRD numbers since most are "N"
  const prepared = rows
    .filter(row => row.firm_name && row.firm_name.trim()) // Only rows with firm names
    .map((row, index) => {
      // Try to parse CRD number, fallback to synthetic number starting from 100000
      let crd: number;
      const crdStr = String(row.crd_number || '').replace(/\D/g, '')
      if (crdStr && crdStr !== '' && Number(crdStr) > 0) {
        crd = Number(crdStr)
      } else {
        crd = 100000 + index // Synthetic CRD starting from 100000
      }
      
      return {
        crd_number: crd,
        legal_name: row.firm_name?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
        aum: toNumber(row.aum),
      }
    })
    .filter(p => p.legal_name) // Valid legal names only

  console.log(`Prepared ${prepared.length} valid profiles`)

  // Insert in batches
  const batchSize = 1000
  let total = 0
  
  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = prepared.slice(i, i + batchSize)
    const { error } = await supabase
      .from('ria_profiles')
      .upsert(batch, { onConflict: 'crd_number' })
    
    if (error) {
      console.error(`Upsert batch ${i + 1}-${i + batch.length} error:`, error.message)
    } else {
      total += batch.length
      console.log(`Upserted ${total}/${prepared.length}`)
    }
  }

  // Verify specific profiles
  const testIds = [29880, 51, 423, 162262, 1331]
  console.log('\nVerifying test profiles:')
  
  for (const id of testIds) {
    const { data } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name')
      .eq('crd_number', id)
      .single()
    
    if (data) {
      console.log(`✅ ${id}: ${data.legal_name}`)
    } else {
      console.log(`❌ ${id}: Not found`)
    }
  }

  console.log('✅ Completed load to MCP database')
}

main().catch(console.error)
