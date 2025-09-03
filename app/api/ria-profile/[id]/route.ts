import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Proxy endpoint to maintain backward compatibility with frontend
 * Forwards requests to the v1 API endpoint at /api/v1/ria/profile/[cik]/
 */

export async function OPTIONS(request: NextRequest) {
  // Forward to v1 endpoint
  const id = request.nextUrl.pathname.split('/').pop()
  const url = new URL(`/api/v1/ria/profile/${id}`, request.url)
  
  return fetch(url.toString(), {
    method: 'OPTIONS',
    headers: request.headers,
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    
    // First, check if this is a CIK from advisers table
    const { data: adviserData, error: adviserError } = await supabaseAdmin
      .from('advisers')
      .select('adviser_pk, cik, legal_name, main_addr_street1, main_addr_city, main_addr_state, main_addr_zip, main_addr_country')
      .eq('cik', id)
      .single()
    
    let actualId = id
    
    if (adviserData) {
      // Found in advisers table by CIK
      // Try to find the corresponding record in ria_profiles by legal name
      const { data: profileMatch } = await supabaseAdmin
        .from('ria_profiles')
        .select('crd_number')
        .eq('legal_name', adviserData.legal_name)
        .single()
      
      if (profileMatch) {
        // Use the CRD from ria_profiles for the v1 endpoint
        actualId = String(profileMatch.crd_number)
      } else {
        // No match in ria_profiles, create a temporary response from advisers data
        return NextResponse.json({
          cik: adviserData.cik,
          crd_number: adviserData.adviser_pk,
          legal_name: adviserData.legal_name,
          main_office_location: {
            street: adviserData.main_addr_street1 || undefined,
            city: adviserData.main_addr_city,
            state: adviserData.main_addr_state,
            zipcode: adviserData.main_addr_zip || undefined,
            country: adviserData.main_addr_country || 'US',
          },
          main_addr_street1: adviserData.main_addr_street1 || null,
          main_addr_street2: null,
          main_addr_city: adviserData.main_addr_city,
          main_addr_state: adviserData.main_addr_state,
          main_addr_zip: adviserData.main_addr_zip || null,
          main_addr_country: adviserData.main_addr_country || 'United States',
          total_aum: null,
          phone_number: null,
          fax_number: null,
          website: null,
          executives: [],
          filings: [],
          private_funds: []
        })
      }
    }
    
    // Construct URL to v1 endpoint with the actual ID
    const url = new URL(`/api/v1/ria/profile/${actualId}`, request.url)
    
    // Copy query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })
    
    // Forward the request to v1 endpoint
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: request.headers,
    })
    
    // Return the response from v1 endpoint
    const data = await response.json()
    return NextResponse.json(data, { 
      status: response.status,
      headers: response.headers 
    })
    
  } catch (error) {
    console.error('ria-profile proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' }, 
      { status: 500 }
    )
  }
}
