// Simple environment test - using pages/api for immediate deployment
export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const projectId = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'
  
  let status = '❌ WRONG'
  if (projectId === 'llusjnpltqxhokycwzry') {
    status = '✅ CORRECT'
  } else if (projectId === 'mshjimyrftxojporisxb') {
    status = '❌ WRONG (Budgetbuddy)'
  } else if (projectId === 'aqngxprpznclhtsmibsi') {
    status = '❌ WRONG (Linkedly)'
  }

  res.json({
    production_database: {
      project_id: projectId,
      status: status,
      expected: 'llusjnpltqxhokycwzry',
      full_url: supabaseUrl?.substring(0, 60) + '...',
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      node_env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    }
  })
}
