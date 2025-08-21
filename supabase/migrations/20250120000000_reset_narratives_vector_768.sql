-- Reset narratives table with correct vector(768) dimensions
-- Drop existing table with corrupted 769-dimensional embeddings

DROP TABLE IF EXISTS narratives CASCADE;

-- Create narratives table with correct vector(768) schema
CREATE TABLE narratives (
  id uuid primary key default gen_random_uuid(),
  crd_number integer references ria_profiles(crd_number) on delete cascade,
  narrative text not null,
  embedding vector(768),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create HNSW index for efficient vector similarity search
CREATE INDEX idx_narratives_embedding_hnsw 
  ON narratives USING hnsw (embedding vector_ip_ops) 
  WITH (m = 16, ef_construction = 64);

-- Enable Row Level Security
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;

-- Create policies for public read and admin insert
CREATE POLICY "public_read" ON narratives
  FOR SELECT 
  USING (true);

CREATE POLICY "admin_insert" ON narratives
  FOR INSERT 
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE narratives IS 'RIA narrative text with 768-dimensional embeddings for semantic search';
