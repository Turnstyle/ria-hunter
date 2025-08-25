export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple environment check without prisma
    return NextResponse.json({
      ok: true,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL_present: Boolean(process.env.DATABASE_URL),
        WELCOME_CREDITS: process.env.WELCOME_CREDITS,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message) }, { status: 500 });
  }
}