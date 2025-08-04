-- Supabase seed schema for RIA Hunter
-- Based on 04b_supabase_seed.md

-- Enable pgvector extension for embeddings
create extension if not exists vector;

-- Create ria_profiles table
create table if not exists public.ria_profiles (
  crd_number bigint primary key,
  legal_name text,
  city text,
  state char(2),
  aum numeric,
  form_adv_date date
);

-- Create narratives table with vector embeddings
create table if not exists public.narratives (
  crd_number bigint references ria_profiles(crd_number) on delete cascade,
  narrative text,
  embedding vector(384) -- pgvector extension
);
