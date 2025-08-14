-- Create compute_vc_activity function if not exists
create or replace function compute_vc_activity(
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
  with ranked_firms as (
    select
      rp.crd_number,
      rp.legal_name,
      rp.city,
      rp.state,
      count(distinct rpf.id) as vc_fund_count,
      coalesce(sum(rpf.gross_asset_value), 0) as vc_total_aum,
      (count(distinct rpf.id) * 0.6 + coalesce(sum(rpf.gross_asset_value) / 1000000, 0) * 0.4) as activity_score
    from ria_profiles rp
    join ria_private_funds rpf on rp.crd_number = rpf.crd_number
      and rpf.fund_type ilike any(array['%venture%', '%vc%', '%startup%'])
    where (state_filter is null or rp.state = state_filter)
    group by rp.crd_number, rp.legal_name, rp.city, rp.state
    having count(rpf.id) > 0
    order by activity_score desc
    limit result_limit
  )
  select
    rf.crd_number,
    rf.legal_name,
    rf.city,
    rf.state,
    rf.vc_fund_count,
    rf.vc_total_aum,
    rf.activity_score,
    (
      select jsonb_agg(json_build_object('name', cp.full_name, 'title', cp.title))
      from control_persons cp
      where cp.firm_crd_number = rf.crd_number
    ) as executives
  from ranked_firms rf;
end;
$$;


