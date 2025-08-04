-- Create performance index on ria_profiles table
-- Index on state and aum (descending) for efficient queries

create index if not exists idx_ria_profiles_state_aum 
on public.ria_profiles (state, aum desc nulls last);
