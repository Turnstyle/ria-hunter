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
