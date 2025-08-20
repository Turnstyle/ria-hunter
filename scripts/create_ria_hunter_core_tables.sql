-- Create core tables for RIA Hunter project
-- Based on the overhaul plan requirements

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ria_profiles table
CREATE TABLE IF NOT EXISTS public.ria_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sec_number TEXT UNIQUE NOT NULL, -- SEC identifier (CIK or CRD)
  city TEXT,
  state TEXT,
  aum NUMERIC,
  employee_count INTEGER,
  services TEXT[],
  client_types TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create narratives table
CREATE TABLE IF NOT EXISTS public.narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ria_id UUID REFERENCES ria_profiles(id) ON DELETE CASCADE,
  narrative_text TEXT NOT NULL,
  embedding VECTOR(384),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create control_persons table
CREATE TABLE IF NOT EXISTS public.control_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ria_id UUID REFERENCES ria_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  ownership_percent NUMERIC,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ria_private_funds table
CREATE TABLE IF NOT EXISTS public.ria_private_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ria_id UUID REFERENCES ria_profiles(id) ON DELETE CASCADE,
  fund_name TEXT NOT NULL,
  fund_type TEXT,
  aum NUMERIC,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers for updated_at columns
CREATE TRIGGER update_ria_profiles_timestamp
BEFORE UPDATE ON ria_profiles
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER update_narratives_timestamp
BEFORE UPDATE ON narratives
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER update_control_persons_timestamp
BEFORE UPDATE ON control_persons
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

CREATE TRIGGER update_ria_private_funds_timestamp
BEFORE UPDATE ON ria_private_funds
FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();

-- Create HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_narratives_embedding_hnsw
ON narratives USING hnsw (embedding vector_ip_ops)
WITH (m = 4, ef_construction = 10);

-- Create a vector similarity search function
CREATE OR REPLACE FUNCTION match_narratives(
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 20
) 
RETURNS TABLE (
  ria_id UUID,
  narrative_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set higher ef_search for better recall
  SET LOCAL hnsw.ef_search = 100;
  
  RETURN QUERY
  SELECT
    n.ria_id,
    n.narrative_text,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM narratives n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create a compute_vc_activity function to rank VC activity
CREATE OR REPLACE FUNCTION compute_vc_activity(
  ria_id UUID
)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
  vc_score FLOAT;
BEGIN
  SELECT
    COALESCE(
      (
        -- Base VC score from private funds labeled as venture capital
        SELECT COUNT(*) * 1.5 FROM ria_private_funds 
        WHERE ria_id = compute_vc_activity.ria_id 
          AND fund_type ILIKE '%venture%'
      ) + 
      (
        -- Additional score from total AUM in VC funds
        SELECT COALESCE(SUM(aum) / 1000000 * 0.1, 0) FROM ria_private_funds 
        WHERE ria_id = compute_vc_activity.ria_id 
          AND fund_type ILIKE '%venture%'
      ),
      0
    ) INTO vc_score;
    
  RETURN vc_score;
END;
$$;

-- Enable Row Level Security on all tables
ALTER TABLE ria_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ria_private_funds ENABLE ROW LEVEL SECURITY;

-- Create public read policies
CREATE POLICY "public read ria_profiles" ON ria_profiles
  FOR SELECT USING (true);

CREATE POLICY "public read narratives" ON narratives
  FOR SELECT USING (true);

CREATE POLICY "public read control_persons" ON control_persons
  FOR SELECT USING (true);

CREATE POLICY "public read ria_private_funds" ON ria_private_funds
  FOR SELECT USING (true);

-- Create admin insert policies
CREATE POLICY "admin insert ria_profiles" ON ria_profiles
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admin insert narratives" ON narratives
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admin insert control_persons" ON control_persons
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admin insert ria_private_funds" ON ria_private_funds
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Create admin update policies
CREATE POLICY "admin update ria_profiles" ON ria_profiles
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "admin update narratives" ON narratives
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "admin update control_persons" ON control_persons
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "admin update ria_private_funds" ON ria_private_funds
  FOR UPDATE USING (auth.role() = 'service_role');

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ria_profiles_state ON ria_profiles(state);
CREATE INDEX IF NOT EXISTS idx_ria_profiles_sec_number ON ria_profiles(sec_number);
CREATE INDEX IF NOT EXISTS idx_narratives_ria_id ON narratives(ria_id);
CREATE INDEX IF NOT EXISTS idx_control_persons_ria_id ON control_persons(ria_id);
CREATE INDEX IF NOT EXISTS idx_ria_private_funds_ria_id ON ria_private_funds(ria_id);
CREATE INDEX IF NOT EXISTS idx_ria_private_funds_fund_type ON ria_private_funds(fund_type);
