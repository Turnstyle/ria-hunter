-- Fix the compute_vc_activity function to use correct column name
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
    rp.legal_name,
    rp.city,
    rp.state,
    coalesce(rp.private_fund_count, 0)::bigint as vc_fund_count,
    coalesce(rp.private_fund_aum, 0)::numeric as vc_total_aum,
    (coalesce(rp.private_fund_count, 0) * 0.6 + coalesce(rp.private_fund_aum, 0) / 1000000 * 0.4)::numeric as activity_score,
    (
      select jsonb_agg(json_build_object('name', cp.person_name, 'title', cp.title))
      from public.control_persons cp
      where cp.crd_number = rp.crd_number  -- FIXED: was cp.adviser_id
    ) as executives
  from public.ria_profiles rp
  where (state_filter is null or rp.state = state_filter)
  and coalesce(rp.private_fund_count, 0) > 0
  order by activity_score desc
  limit result_limit;
end;
$$;


