-- Denormalized view for executives by firm
create or replace view public.executives_by_firm as
select
  rp.crd_number,
  rp.legal_name,
  jsonb_agg(jsonb_build_object('name', cp.person_name, 'title', cp.title) order by cp.person_name) as executives
from public.ria_profiles rp
left join public.control_persons cp on (cp.crd_number::bigint = rp.crd_number)
group by rp.crd_number, rp.legal_name;

-- Denormalized view for private fund metrics by firm (using aggregated columns on profiles)
create or replace view public.private_fund_type_by_firm as
select
  rp.crd_number,
  rp.legal_name,
  rp.city,
  rp.state,
  coalesce(rp.private_fund_count,0)::bigint as vc_fund_count,
  coalesce(rp.private_fund_aum,0)::numeric as vc_total_aum,
  (coalesce(rp.private_fund_count,0)*0.6 + coalesce(rp.private_fund_aum,0)/1000000*0.4)::numeric as activity_score
from public.ria_profiles rp;

-- Materialized view combining both for faster lookups
create materialized view if not exists public.mv_firm_activity as
select
  p.crd_number,
  p.legal_name,
  p.city,
  p.state,
  p.vc_fund_count,
  p.vc_total_aum,
  p.activity_score,
  e.executives
from public.private_fund_type_by_firm p
left join public.executives_by_firm e using (crd_number);

create index if not exists idx_mv_firm_activity_crd on public.mv_firm_activity(crd_number);
create index if not exists idx_mv_firm_activity_state_city on public.mv_firm_activity(state, city);
create index if not exists idx_mv_firm_activity_score on public.mv_firm_activity(activity_score desc);

-- Helpful indexes on base tables
create index if not exists idx_profiles_crd on public.ria_profiles(crd_number);
create index if not exists idx_profiles_state_city on public.ria_profiles(state, city);
create index if not exists idx_profiles_pf_score on public.ria_profiles((coalesce(private_fund_count,0)*0.6 + coalesce(private_fund_aum,0)/1000000*0.4));
create index if not exists idx_control_persons_crd on public.control_persons((crd_number::bigint));

-- Refresh function and helper
create or replace function public.refresh_mv_firm_activity() returns void language sql as $$
  refresh materialized view concurrently public.mv_firm_activity;
$$;


