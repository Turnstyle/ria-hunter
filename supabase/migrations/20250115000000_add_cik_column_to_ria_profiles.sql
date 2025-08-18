-- Add CIK (Central Index Key) column to ria_profiles table
-- This will fix the CIK vs CRD identifier mismatch issue

-- Add the cik column as TEXT (since CIK can have leading zeros)
ALTER TABLE public.ria_profiles 
ADD COLUMN IF NOT EXISTS cik TEXT;

-- Create an index for performance on CIK lookups
CREATE INDEX IF NOT EXISTS idx_ria_profiles_cik ON public.ria_profiles(cik);

-- Add a unique constraint since CIK should be unique when present
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ria_profiles_cik ON public.ria_profiles(cik) WHERE cik IS NOT NULL;

-- Add documentation comment
COMMENT ON COLUMN public.ria_profiles.cik IS 'SEC Central Index Key (CIK) number from EDGAR system, used in SEC filings and frontend URLs';
