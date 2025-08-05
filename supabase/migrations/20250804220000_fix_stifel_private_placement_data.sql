-- Fix STIFEL private placement data by updating the correct existing record
-- The real STIFEL record is CRD 423, not 793

-- Update the existing STIFEL record (CRD 423) with private placement data
UPDATE public.ria_profiles 
SET 
  private_fund_count = 230,
  private_fund_aum = 2991057185,
  last_private_fund_analysis = '2025-08-04',
  aum = 54000000000  -- Update general AUM too
WHERE crd_number = 423 
  AND legal_name ILIKE '%STIFEL%';

-- Remove the duplicate record we accidentally created
DELETE FROM public.ria_profiles 
WHERE crd_number = 793;

-- Also update any other existing St. Louis RIAs if they exist
-- (We'll keep the new records we created for the others since they likely don't exist)

-- Verify the update worked
-- SELECT legal_name, crd_number, city, state, aum, private_fund_count, private_fund_aum 
-- FROM public.ria_profiles 
-- WHERE state = 'MO' AND private_fund_count > 0 
-- ORDER BY private_fund_count DESC;