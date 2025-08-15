-- Create tables for private funds and fund marketers

-- 1) Private funds per RIA
create table if not exists public.ria_private_funds (
  id bigserial primary key,
  crd_number bigint not null references public.ria_profiles(crd_number) on delete cascade,
  filing_id bigint,
  reference_id bigint,
  fund_name text,
  fund_id text,
  fund_type text,
  fund_type_other text,
  gross_asset_value numeric,
  min_investment numeric,
  is_3c1 boolean,
  is_3c7 boolean,
  is_master boolean,
  is_feeder boolean,
  master_fund_name text,
  master_fund_id text,
  is_fund_of_funds boolean,
  invested_self_related boolean,
  invested_securities boolean,
  prime_brokers text,
  custodians text,
  administrator text,
  percent_assets_valued numeric,
  marketing boolean,
  annual_audit boolean,
  gaap boolean,
  fs_distributed boolean,
  unqualified_opinion boolean,
  owners integer,
  created_at timestamptz default now()
);

create index if not exists idx_rpf_crd on public.ria_private_funds (crd_number);
create index if not exists idx_rpf_fund_type on public.ria_private_funds (fund_type);
create unique index if not exists uniq_rpf_crd_filing_ref on public.ria_private_funds (crd_number, filing_id, reference_id);

comment on table public.ria_private_funds is 'Private funds disclosed on Form ADV Schedule D 7.B(1)';

-- 2) Fund marketers/placement agents per fund
create table if not exists public.ria_fund_marketers (
  id bigserial primary key,
  crd_number bigint not null references public.ria_profiles(crd_number) on delete cascade,
  filing_id bigint,
  fund_reference_id bigint,
  related_person boolean,
  marketer_name text,
  marketer_sec_number text,
  marketer_crd_number bigint,
  city text,
  state text,
  country text,
  website text,
  created_at timestamptz default now()
);

create index if not exists idx_rfm_crd on public.ria_fund_marketers (crd_number);
create unique index if not exists uniq_rfm_crd_filing_ref_name on public.ria_fund_marketers (crd_number, filing_id, fund_reference_id, marketer_name);

comment on table public.ria_fund_marketers is 'Placement/marketing relationships (Schedule D 7.B(1)A(28)) linked by filing and fund reference id';


