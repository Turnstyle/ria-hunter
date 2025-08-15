-- Add phone/website to ria_profiles and create control_persons table

-- 1) Extend ria_profiles with contact fields
alter table if exists public.ria_profiles
  add column if not exists phone text,
  add column if not exists website text;

-- 2) Create control_persons (executives/owners)
create table if not exists public.control_persons (
  id bigserial primary key,
  crd_number bigint not null references public.ria_profiles(crd_number) on delete cascade,
  person_name text not null,
  title text,
  created_at timestamp with time zone default now()
);

-- 3) Helpful indexes
create index if not exists idx_control_persons_crd on public.control_persons (crd_number);
create index if not exists idx_ria_profiles_phone on public.ria_profiles (phone);
create index if not exists idx_ria_profiles_website on public.ria_profiles (website);

-- 4) Documentation comments
comment on table public.control_persons is 'Direct owners and executive officers (Form ADV Schedule A/B) associated with an RIA firm';
comment on column public.control_persons.person_name is 'Name of executive/owner as reported on Form ADV';
comment on column public.control_persons.title is 'Title/role if provided (e.g., CEO, Managing Partner, Owner)';


