-- Production-safe VC activity setup
-- - Mirrors executive names to person_name
-- - Creates index on person_name
-- - Creates compute_vc_activity(result_limit, state_filter) function

begin;

-- 1) Mirror person_name and index
ALTER TABLE public.control_persons ADD COLUMN IF NOT EXISTS person_name text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'control_persons' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE public.control_persons
      SET person_name = COALESCE(person_name, name)
      WHERE person_name IS NULL OR person_name = '''''' ';  -- empty string
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_control_persons_person_name ON public.control_persons(person_name);

-- 2) Create function (profiles-only variant); casts ensure return types match
create or replace function public.compute_vc_activity(
  result_limit integer default 10,
  state_filter text default null
)
returns table (
  crd_number bigint,
  legal_name text,
  city text,
  state text,
  vc_fund_count bigint,
  vc_total_aum numeric,
  activity_score numeric,
  executives jsonb
)
language plpgsql
as $$
begin
  return query
  select
    rp.crd_number,
    rp.legal_name::text,
    rp.city::text,
    rp.state::text,
    coalesce(rp.private_fund_count, 0)::bigint as vc_fund_count,
    coalesce(rp.private_fund_aum, 0)::numeric as vc_total_aum,
    (coalesce(rp.private_fund_count, 0) * 0.6 + coalesce(rp.private_fund_aum, 0) / 1000000 * 0.4)::numeric as activity_score,
    (
      select jsonb_agg(json_build_object('name', cp.person_name, 'title', cp.title))
      from public.control_persons cp
      where (cp.adviser_id::bigint) = rp.crd_number
    ) as executives
  from public.ria_profiles rp
  where (state_filter is null or rp.state = state_filter)
    and coalesce(rp.private_fund_count, 0) > 0
  order by activity_score desc
  limit result_limit;
end;
$$;

commit;

-- Verification helpers (uncomment to run manually)
-- -- SELECT COUNT(*) as function_exists FROM pg_proc WHERE proname = 'compute_vc_activity';
-- -- SELECT * FROM public.compute_vc_activity(5, 'MO');


