// app/api/balance/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Simple test response to verify the route works
    return NextResponse.json({ 
      balance: 15,
      credits: 15,
      isSubscriber: false,
      source: 'test-fixed',
      debug: 'Simple test response to verify routing'
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Test route error', 
      details: (error as any).message 
    }, { status: 500 });
  }
}