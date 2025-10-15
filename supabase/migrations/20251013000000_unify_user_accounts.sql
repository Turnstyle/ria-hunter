-- Unify user_accounts schema and ensure canonical columns exist
create extension if not exists "pgcrypto";
create extension if not exists "citext";

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_accounts'
  ) then
    create table public.user_accounts (
      id uuid primary key default gen_random_uuid(),
      email citext unique not null,
      stripe_customer_id text unique,
      stripe_subscription_id text,
      subscription_status text,
      plan text,
      current_period_end timestamptz,
      is_subscriber boolean not null default false,
      balance integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end
$$;

alter table public.user_accounts
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists email citext,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists plan text,
  add column if not exists current_period_end timestamptz,
  add column if not exists is_subscriber boolean,
  add column if not exists balance integer,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.user_accounts
set id = coalesce(id, gen_random_uuid());

alter table public.user_accounts
  alter column id set default gen_random_uuid(),
  alter column id set not null;

alter table public.user_accounts
  alter column is_subscriber set default false,
  alter column is_subscriber set not null;

update public.user_accounts
set balance = coalesce(balance, 0);

alter table public.user_accounts
  alter column balance set default 0,
  alter column balance set not null;

update public.user_accounts
set email = concat('unknown-', id::text)
where email is null;

alter table public.user_accounts
  alter column email set not null;

alter table public.user_accounts
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.user_accounts
  drop constraint if exists user_accounts_pkey;

alter table public.user_accounts
  add primary key (id);

create unique index if not exists user_accounts_email_key
  on public.user_accounts (email);

create unique index if not exists user_accounts_stripe_customer_id_key
  on public.user_accounts (stripe_customer_id)
  where stripe_customer_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_accounts_updated_at on public.user_accounts;
create trigger trg_user_accounts_updated_at
  before update on public.user_accounts
  for each row execute procedure public.set_updated_at();
