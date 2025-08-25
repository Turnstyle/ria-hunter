// app/_backend/api/admin/db-sanity/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CREDITS_SECRET = process.env.CREDITS_SECRET;

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .maybeSingle();
      
    if (error) {
      console.error(`Error checking table existence: ${error.message}`);
      return false;
    }
    
    return !!data;
  } catch (err) {
    console.error(`Error in tableExists: ${(err as Error).message}`);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Check for authorization header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== CREDITS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const response: any = {
    ok: true,
    created: [],
    skipped: []
  };
  
  // Check which tables already exist
  const [userAccountsExists, creditTransactionsExists, stripeEventsExists] = await Promise.all([
    tableExists('user_accounts'),
    tableExists('credit_transactions'),
    tableExists('stripe_events')
  ]);
  
  // Create tables that don't exist
  try {
    // SQL to execute - use IF NOT EXISTS for safety
    const sql = `
      -- Extensions
      create extension if not exists "pgcrypto";
      create extension if not exists "citext";
      
      -- Users table: one row per email, holds Stripe linkage + pro flag
      create table if not exists public.user_accounts (
        id uuid primary key default gen_random_uuid(),
        email citext unique not null,
        stripe_customer_id text unique,
        stripe_subscription_id text,
        subscription_status text,
        is_pro boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      
      create or replace function public.set_updated_at()
      returns trigger language plpgsql as $$
      begin
        new.updated_at = now();
        return new;
      end$$;
      
      drop trigger if exists trg_user_accounts_updated_at on public.user_accounts;
      create trigger trg_user_accounts_updated_at
        before update on public.user_accounts
        for each row execute procedure public.set_updated_at();
      
      -- Credits ledger (kept minimal for now)
      create table if not exists public.credit_transactions (
        id bigserial primary key,
        user_id uuid not null references public.user_accounts(id) on delete cascade,
        delta integer not null,
        reason text,
        source text,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_credit_tx_user on public.credit_transactions(user_id);
      
      create or replace function public.get_credits_balance(p_user_id uuid)
      returns integer language sql stable as $$
        select coalesce(sum(delta), 0)
        from public.credit_transactions
        where user_id = p_user_id;
      $$;
      
      -- Stripe idempotency guard
      create table if not exists public.stripe_events (
        id text primary key,
        type text not null,
        created_at timestamptz not null default now()
      );
    `;
    
    // Execute the SQL
    const { error } = await supabaseAdmin.rpc('pg_execute', { sql });
    
    if (error) {
      console.error(`Error creating tables: ${error.message}`);
      return NextResponse.json({ 
        error: 'Failed to create tables', 
        details: error.message 
      }, { status: 500 });
    }
    
    // Log what was created vs. skipped
    if (!userAccountsExists) {
      response.created.push('user_accounts');
    } else {
      response.skipped.push('user_accounts');
    }
    
    if (!creditTransactionsExists) {
      response.created.push('credit_transactions');
    } else {
      response.skipped.push('credit_transactions');
    }
    
    if (!stripeEventsExists) {
      response.created.push('stripe_events');
    } else {
      response.skipped.push('stripe_events');
    }
    
    return NextResponse.json(response);
  } catch (err) {
    console.error(`Error in db-sanity: ${(err as Error).message}`);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: (err as Error).message 
    }, { status: 500 });
  }
}
