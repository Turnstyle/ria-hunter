-- Add private placement data from St. Louis RIA analysis
-- Based on Schedule D 7.B(1) analysis completed 2025-08-04

-- Add private placement columns to ria_profiles
alter table public.ria_profiles 
add column if not exists private_fund_count integer default 0,
add column if not exists private_fund_aum numeric default 0,
add column if not exists last_private_fund_analysis date;

-- Create index for private placement queries
create index if not exists idx_ria_profiles_private_funds 
on public.ria_profiles (private_fund_count desc, private_fund_aum desc);

-- Create index for location-based private placement queries
create index if not exists idx_ria_profiles_location_private 
on public.ria_profiles (state, city, private_fund_count desc);

-- Insert/Update St. Louis private placement leaders from our analysis
-- Using UPSERT pattern to handle existing records

-- We'll need to find CRD numbers for these firms, but for now using placeholder logic
-- In production, this would be done via proper data matching

-- Comment: The following data comes from comprehensive analysis of 
-- 203,277 private fund records across 43,334 adviser filings from Aug 2024 - July 2025

-- Note: This migration sets up the schema. 
-- The actual data population should be done via the analysis script
-- once CRD number matching is implemented.

-- Add comment to document data source
comment on column public.ria_profiles.private_fund_count is 
'Number of private funds managed by the RIA based on Schedule D 7.B(1) analysis';

comment on column public.ria_profiles.private_fund_aum is 
'Total gross asset value of private funds managed by the RIA';

comment on column public.ria_profiles.last_private_fund_analysis is 
'Date of last private fund analysis update';