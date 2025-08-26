// app/api/test-backend-fix/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return NextResponse.json({ 
    success: true,
    message: 'Test route is working',
    timestamp: new Date().toISOString()
  });
}
