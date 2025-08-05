-- Enable pgvector extension for semantic search
create extension if not exists vector;

-- Create vector similarity search function for narratives
create or replace function match_narratives (
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  crd_number text,
  narrative text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    narratives.crd_number,
    narratives.narrative,
    1 - (narratives.embedding <=> query_embedding) as similarity
  from narratives
  where narratives.embedding is not null
    and 1 - (narratives.embedding <=> query_embedding) > match_threshold
  order by narratives.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create index for faster vector similarity search
create index if not exists narratives_embedding_idx 
on narratives using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Add comment to document the function
comment on function match_narratives is 
'Semantic similarity search across RIA narratives using vector embeddings';

-- Create enhanced search function that joins with RIA profiles
create or replace function search_rias_by_narrative (
  query_embedding vector(384),
  match_threshold float default 0.3,
  match_count int default 50,
  location_filter text default null,
  min_private_funds int default 0
)
returns table (
  crd_number text,
  legal_name text,
  narrative text,
  similarity float,
  city text,
  state text,
  private_fund_count int,
  private_fund_aum numeric,
  total_assets numeric
)
language plpgsql
as $$
begin
  return query
  select
    n.crd_number,
    r.legal_name,
    n.narrative,
    1 - (n.embedding <=> query_embedding) as similarity,
    r.city,
    r.state,
    coalesce(r.private_fund_count, 0)::int,
    coalesce(r.private_fund_aum, 0)::numeric,
    coalesce(r.total_assets, 0)::numeric
  from narratives n
  join ria_profiles r on n.crd_number = r.crd_number::text
  where n.embedding is not null
    and 1 - (n.embedding <=> query_embedding) > match_threshold
    and (location_filter is null or r.state ilike location_filter)
    and coalesce(r.private_fund_count, 0) >= min_private_funds
  order by n.embedding <=> query_embedding
  limit match_count;
end;
$$;