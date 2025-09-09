import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

export async function GET(req: NextRequest) {
  console.log('🔍 Test St. Louis endpoint called');
  
  try {
    // Direct database query for St. Louis RIAs
    const { data: rias, error } = await supabaseAdmin
      .from('ria_profiles')
      .select('crd_number, legal_name, city, state, aum')
      .eq('state', 'MO')
      .or('city.ilike.%St. Louis%,city.ilike.%ST LOUIS%,city.ilike.%Saint Louis%')
      .order('aum', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const response = {
      success: true,
      total: rias?.length || 0,
      query: 'Direct St. Louis, MO query',
      results: rias || []
    };
    
    const headers = new Headers(corsHeaders);
    return NextResponse.json(response, { headers });
    
  } catch (error) {
    console.error('Error in test endpoint:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
