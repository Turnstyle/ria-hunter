-- Example data hygiene script (review before running in production)
begin;

-- 1) Remove fabricated test data (guarded by likely test CRDs)
delete from ria_profiles where crd_number >= 999000;
delete from control_persons where firm_crd_number >= 999000;

-- 2) Normalize malformed AUM
update ria_profiles
set aum = case
  when aum ~ '^[0-9\\.]+$' then aum::numeric
  else null
end;

-- 3) Remove rows missing critical identifiers
delete from ria_profiles where crd_number is null or legal_name is null;

commit;


