-- Create contact_submissions table to collect contact/notify forms
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  subject text,
  message text,
  company text,
  role text,
  phone text,
  extra jsonb,
  created_at timestamptz default now()
);

-- Basic indexes
create index if not exists idx_contact_submissions_email on public.contact_submissions(email);
create index if not exists idx_contact_submissions_created_at on public.contact_submissions(created_at);

-- Enable RLS
alter table if exists public.contact_submissions enable row level security;

-- Allow service_role to manage inserts/reads
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='contact_submissions' and policyname='Service role can manage contact_submissions'
  ) then
    create policy "Service role can manage contact_submissions" on public.contact_submissions
      for all using (auth.jwt() ->> 'role' = 'service_role');
  end if;
end$$;


