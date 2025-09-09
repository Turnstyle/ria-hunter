import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { corsHeaders, handleOptionsRequest, corsError } from '@/lib/cors';

// Handle OPTIONS requests for CORS
export function OPTIONS(req: NextRequest) {
  return handleOptionsRequest(req);
}

// Test individual columns to see which ones exist
export async function GET(req: NextRequest) {
  const requestId = `debug-columns-${Date.now()}`;
  
  console.log(`[${requestId}] === DEBUG COLUMNS TEST ===`);
  
  try {
    // Test each column individually
    const testColumns = [
      'crd_number',
      'legal_name', 
      'city',
      'state',
      'aum',
      'private_fund_count',
      'private_fund_aum',
      'business_zip',
      'business_phone',
      'business_email',
      'website',
      'employee_count',
      'total_accounts',
      'discretionary_aum'
    ];

    const columnTests: Record<string, boolean> = {};

    for (const column of testColumns) {
      try {
        const { data, error } = await supabaseAdmin
          .from('ria_profiles')
          .select(column)
          .limit(1);
        
        columnTests[column] = !error;
        if (error) {
          console.log(`Column ${column} failed: ${error.message}`);
        }
      } catch (err) {
        columnTests[column] = false;
        console.log(`Column ${column} exception: ${err}`);
      }
    }

    // Also get a sample record to see what columns are available
    const { data: sampleRecord, error: sampleError } = await supabaseAdmin
      .from('ria_profiles')
      .select('*')
      .limit(1);

    const response = {
      success: true,
      columnTests,
      availableColumns: sampleError ? null : (sampleRecord?.[0] ? Object.keys(sampleRecord[0]) : []),
      sampleRecord: sampleRecord?.[0] || null,
      metadata: {
        requestId,
        timestamp: new Date().toISOString()
      }
    };

    console.log(`[${requestId}] Column tests completed`);
    
    return NextResponse.json(response, { headers: corsHeaders(req) });
    
  } catch (error) {
    console.error(`[${requestId}] Column test error:`, error);
    return corsError(req, `Column test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
}
