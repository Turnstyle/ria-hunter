-- Add missing control_persons table if not exists (idempotent)
create table if not exists public.control_persons (
  id uuid primary key default gen_random_uuid(),
  crd_number bigint not null references public.ria_profiles(crd_number) on delete cascade,
  person_name text not null,
  title text,
  created_at timestamptz default now()
);

-- Create index for performance
create index if not exists idx_control_persons_crd_number on public.control_persons(crd_number);

-- Enable RLS (safe if already enabled)
alter table if exists public.control_persons enable row level security;

-- Public read policy (idempotent pattern)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'control_persons' and policyname = 'Allow public read access'
  ) then
    create policy "Allow public read access" on public.control_persons
      for select using (true);
  end if;
end$$;

-- Optional sample data (safe no-op if already present)
insert into public.control_persons (crd_number, person_name, title)
values
  (423, 'Ronald James Kruszewski', 'Chairman and CEO'),
  (423, 'James M. Zemlyak', 'President'),
  (423, 'Victor E. Nesi', 'Chief Financial Officer')
on conflict do nothing;


