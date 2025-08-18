#!/usr/bin/env npx tsx

// Fix ALL profiles with placeholder "N" and "Y" values in legal_name
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
  console.log('🔧 FIXING ALL placeholder "N" and "Y" values in legal_name...\n')

  // Load ADV data for real company names
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

  // Create lookup map with real company names
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

  console.log(`Created lookup map with ${advLookup.size} real company profiles`)

  // Get ALL profiles with placeholder values (N, Y, or NULL)
  const { data: badProfiles } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name')
    .in('legal_name', ['N', 'Y'])
    .limit(10000)  // Get more profiles

  if (!badProfiles || badProfiles.length === 0) {
    console.log('No placeholder profiles found')
    return
  }

  console.log(`Found ${badProfiles.length} profiles with placeholder names to fix`)
  
  // Show sample of what we're fixing
  console.log('\nSample profiles to fix:')
  badProfiles.slice(0, 10).forEach(p => {
    console.log(`  CRD ${p.crd_number}: "${p.legal_name}" → will replace with real name`)
  })

  // Update profiles in batches
  let fixed = 0
  let notFound = 0
  
  for (const profile of badProfiles) {
    const crd = profile.crd_number
    const realData = advLookup.get(crd)
    
    if (realData) {
      const { error } = await supabase
        .from('ria_profiles')
        .update(realData)
        .eq('crd_number', crd)
      
      if (error) {
        console.error(`❌ Update error for CRD ${crd}:`, error.message)
      } else {
        fixed++
        if (fixed % 100 === 0) {
          console.log(`✅ Fixed ${fixed}/${badProfiles.length} profiles...`)
        }
      }
    } else {
      // Even if we don't have ADV data, let's put a better placeholder
      const { error } = await supabase
        .from('ria_profiles')
        .update({ legal_name: `RIA FIRM ${crd}` })
        .eq('crd_number', crd)
      
      if (!error) {
        fixed++
        notFound++
      }
    }
    
    // Rate limiting
    if (fixed % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`\n🎉 Fix complete!`)
  console.log(`✅ Fixed: ${fixed} profiles`)
  console.log(`📊 With real company names: ${fixed - notFound}`)
  console.log(`🔄 With placeholder names: ${notFound}`)

  // Verify no more "N" or "Y" values remain
  const { count: remainingBad } = await supabase
    .from('ria_profiles')
    .select('*', { count: 'exact', head: true })
    .in('legal_name', ['N', 'Y'])

  console.log(`\n📊 Remaining placeholder values: ${remainingBad}`)

  if (remainingBad === 0) {
    console.log('🎉 ALL placeholder values fixed!')
  } else {
    console.log(`⚠️ Still ${remainingBad} placeholder values remaining`)
  }

  // Test critical profiles
  const testIds = [29880, 51, 423, 1331, 286381, 336188]
  console.log('\n🧪 Testing critical profiles:')
  
  for (const id of testIds) {
    const { data } = await supabase
      .from('ria_profiles')
      .select('crd_number, legal_name')
      .eq('crd_number', id)
      .single()
    
    if (data) {
      console.log(`${data.legal_name === 'N' || data.legal_name === 'Y' ? '❌' : '✅'} ${id}: ${data.legal_name}`)
    } else {
      console.log(`❌ ${id}: NOT FOUND`)
    }
  }
}

main().catch(console.error)
