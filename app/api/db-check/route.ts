import { NextResponse } from 'next/server'

export async function GET() {
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

  return NextResponse.json({
    production_api_database: {
      project_id: projectId,
      status: status,
      full_url: supabaseUrl?.substring(0, 60) + '...',
      expected: 'llusjnpltqxhokycwzry',
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })
}
