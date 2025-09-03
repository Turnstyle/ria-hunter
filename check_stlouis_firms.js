#!/usr/bin/env node

require('dotenv').config({ path: './env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStLouisFirms() {
  const { data, error } = await supabase
    .from('ria_profiles')
    .select('crd_number, legal_name, city, state, aum')
    .or('city.ilike.%st louis%,city.ilike.%saint louis%,city.ilike.%st. louis%')
    .eq('state', 'MO')
    .order('aum', { ascending: false })
    .limit(100);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  // Group by legal name to see unique firms
  const uniqueFirms = new Map();
  data.forEach(firm => {
    const key = firm.legal_name?.toLowerCase().trim() || '';
    if (!uniqueFirms.has(key) || (firm.aum || 0) > (uniqueFirms.get(key).aum || 0)) {
      uniqueFirms.set(key, firm);
    }
  });
  
  console.log('Top unique firms in St. Louis, MO:');
  const sorted = Array.from(uniqueFirms.values()).sort((a, b) => (b.aum || 0) - (a.aum || 0));
  
  sorted.slice(0, 20).forEach((firm, i) => {
    const aum = firm.aum ? 
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(firm.aum) :
      'N/A';
    console.log(`${i+1}. ${firm.legal_name} - AUM: ${aum} (CRD: ${firm.crd_number})`);
  });
  
  console.log('\nTotal unique firms found:', uniqueFirms.size);
}

checkStLouisFirms();
