export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Check if tables exist
    const tables = await prisma.$queryRawUnsafe<any[]>(`
      select tablename from pg_tables where schemaname='public';
    `);
    const hasAccount = tables.some(t => t.tablename.toLowerCase().includes('creditsaccount'));
    const hasLedger = tables.some(t => t.tablename.toLowerCase().includes('creditsledger'));

    return NextResponse.json({
      ok: true,
      tables: tables.map(t => t.tablename),
      hasAccount,
      hasLedger,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL_present: Boolean(process.env.DATABASE_URL),
        WELCOME_CREDITS: process.env.WELCOME_CREDITS,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message) }, { status: 500 });
  }
}
