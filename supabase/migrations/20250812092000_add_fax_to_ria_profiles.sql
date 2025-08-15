-- Add fax column to ria_profiles for contact info completeness

alter table if exists public.ria_profiles
  add column if not exists fax text;

create index if not exists idx_ria_profiles_fax on public.ria_profiles (fax);

comment on column public.ria_profiles.fax is 'Main office fax number reported on Form ADV';


