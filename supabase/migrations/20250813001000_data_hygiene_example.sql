-- Example data hygiene script (review before running in production)
begin;

-- 1) Remove fabricated test data (guarded by likely test CRDs)
delete from ria_profiles where crd_number >= 999000;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'control_persons' and column_name = 'firm_crd_number'
  ) then
    execute 'delete from control_persons where firm_crd_number >= 999000';
  end if;
end $$;

-- 2) Normalize malformed AUM
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ria_profiles'
      and column_name = 'aum'
      and data_type in ('text','character varying')
  ) then
    execute 'update public.ria_profiles
      set aum = case
        when aum ~ ''^[0-9\\.]+$'' then aum::numeric
        else null
      end';
  end if;
end $$;

-- Guard heavy delete to avoid timeouts in production
do $$
declare _n bigint;
begin
  select count(*) into _n from public.ria_profiles where crd_number is null or legal_name is null;
  if _n is not null and _n < 1000 then
    delete from public.ria_profiles where crd_number is null or legal_name is null;
  else
    raise notice 'Skipping heavy delete of % rows (threshold 1000)', _n;
  end if;
end $$;

commit;


