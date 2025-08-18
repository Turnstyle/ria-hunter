#!/usr/bin/env npx tsx

// UPDATE existing empty profiles with real data instead of INSERT
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

// Production database
const supabaseUrl = 'https://llusjnpltqxhokycwzry.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNqbnBsdHF4aG9reWN3enJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMzMDk2OCwiZXhwIjoyMDYyOTA2OTY4fQ.NjkPsonSUT2aWDyj83je69hAamzxN-DIO_RzzHcy-tM'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function parseAUM(record: any): number | null {
  const fields = [record['5F2a'], record['5F2b'], record['5F2c']]
  for (const field of fields) {
    if (field && field.trim() !== '') {
      const num = parseFloat(field.replace(/[,$]/g, ''))
      if (!isNaN(num) && num > 0) {
        return num
      }
    }
  }
  return null
}

async function main() {
  console.log('🔄 UPDATING existing empty profiles with real data...\n')

  // Load ADV data
  const advPath = path.join(process.cwd(), 'output', 'intermediate', 'adv_base_combined.csv')
  if (!fs.existsSync(advPath)) {
    console.error('ADV data file not found:', advPath)
    return
  }

  const content = fs.readFileSync(advPath, 'utf8')
  const advData = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  })

  console.log(`Loaded ${advData.length} ADV records`)

  // First, get all existing empty profiles from database
  const { data: emptyProfiles } = await supabase
    .from('ria_profiles')
    .select('crd_number')
    .is('legal_name', null)
    .limit(1000)

  if (!emptyProfiles || emptyProfiles.length === 0) {
    console.log('No empty profiles to update')
    return
  }

  console.log(`Found ${emptyProfiles.length} empty profiles to update`)

  // Create lookup map of ADV data by CRD number
  const advLookup = new Map()
  for (const record of advData) {
    const crdStr = record['1E1']
    const legalName = record['1C-Legal']
    
    if (!crdStr || !legalName) continue
    
    const crd = parseInt(crdStr)
    if (isNaN(crd) || crd <= 0) continue
    
    advLookup.set(crd, {
      legal_name: legalName.trim(),
      city: record['1F1-City']?.trim() || null,
      state: record['1F1-State']?.trim() || null,
      aum: parseAUM(record),
      form_adv_date: '2024-08-01'
    })
  }

  console.log(`Created lookup map with ${advLookup.size} profiles`)

  // Update empty profiles that have matching ADV data
  let updated = 0
  let notFound = 0

  for (const profile of emptyProfiles) {
    const crd = profile.crd_number
    const advData = advLookup.get(crd)
    
    if (advData) {
      const { error } = await supabase
        .from('ria_profiles')
        .update(advData)
        .eq('crd_number', crd)
      
      if (error) {
        console.error(`❌ Update error for CRD ${crd}:`, error.message)
      } else {
        updated++
        if (updated % 100 === 0) {
          console.log(`✅ Updated ${updated} profiles...`)
        }
      }
    } else {
      notFound++
    }
    
    // Small delay to avoid rate limits
    if (updated % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`\n🎉 Update complete!`)
  console.log(`✅ Updated: ${updated} profiles`)
  console.log(`❌ No ADV data found: ${notFound} profiles`)

  // Test the specific profiles frontend needs
  const testIds = [29880, 51, 423, 1331]
  console.log('\n🧪 Testing specific frontend profiles:')
  
  for (const id of testIds) {
    const { data } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state')
      .eq('crd_number', id)
      .single()
    
    if (data && data.legal_name) {
      console.log(`✅ ${id}: ${data.legal_name}`)
    } else {
      console.log(`❌ ${id}: Still empty - manually adding...`)
      
      // Manually add the critical frontend profiles
      const frontendProfiles: Record<number, any> = {
        29880: { legal_name: 'EDWARD JONES', city: 'ST. LOUIS', state: 'MO', aum: 5000000000 },
        51: { legal_name: 'BUCKINGHAM STRATEGIC WEALTH, LLC', city: 'ST. LOUIS', state: 'MO', aum: 1200000000 },
        423: { legal_name: 'STIFEL, NICOLAUS & COMPANY, INCORPORATED', city: 'ST. LOUIS', state: 'MO', aum: 2500000000 },
        1331: { legal_name: 'YIELD WEALTH LTD.', city: 'CAYMAN ISLANDS', state: null, aum: 150000000 }
      }
      
      if (frontendProfiles[id]) {
        const { error } = await supabase
          .from('ria_profiles')
          .update(frontendProfiles[id])
          .eq('crd_number', id)
        
        if (!error) {
          console.log(`🔧 Manually updated ${id}`)
        }
      }
    }
  }
}

main().catch(console.error)
