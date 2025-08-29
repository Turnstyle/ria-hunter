// app/api/admin/db-sanity/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DEBUG_HEALTH_KEY = process.env.DEBUG_HEALTH_KEY;

// Helper function to check if a table exists
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .single();
    
    return !error && !!data;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Check for debug health key
  const authHeader = req.headers.get('Authorization');
  const providedKey = authHeader?.replace('Bearer ', '');
  
  if (!DEBUG_HEALTH_KEY || providedKey !== DEBUG_HEALTH_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = [];
    
    // Check critical tables
    const criticalTables = [
      'user_accounts',
      'subscriptions', 
      'user_queries',
      'ria_profiles',
      'narratives'
    ];
    
    for (const tableName of criticalTables) {
      const exists = await tableExists(tableName);
      results.push({
        table: tableName,
        exists,
        status: exists ? 'OK' : 'MISSING'
      });
    }
    
    // Try to get sample data counts
    const sampleChecks = [];
    for (const tableName of criticalTables) {
      try {
        const { count, error } = await supabaseAdmin
          .from(tableName)
          .select('*', { head: true, count: 'exact' });
          
        sampleChecks.push({
          table: tableName,
          count: error ? null : count,
          error: error?.message
        });
      } catch (err) {
        sampleChecks.push({
          table: tableName,
          count: null,
          error: (err as Error).message
        });
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      tables: results,
      counts: sampleChecks,
      summary: {
        allTablesExist: results.every(r => r.exists),
        totalTables: results.length
      }
    });
    
  } catch (error) {
    console.error('DB sanity check error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Database sanity check failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
