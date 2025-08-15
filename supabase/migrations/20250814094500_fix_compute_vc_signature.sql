-- Ensure only one unambiguous function signature exists
-- Keep: public.compute_vc_activity(result_limit integer, state_filter text)
-- Drop the reversed/ambiguous variant if present

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'compute_vc_activity'
      and pg_get_function_identity_arguments(p.oid) = 'state_filter text, result_limit integer'
  ) then
    execute 'drop function public.compute_vc_activity(text, integer)';
  end if;
end $$;

-- Recreate the correct signature to be safe
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


