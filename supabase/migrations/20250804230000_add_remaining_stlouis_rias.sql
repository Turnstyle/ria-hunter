-- Add the remaining 10 St. Louis RIAs that were missing from the previous migration
-- This completes the full dataset of 20 St. Louis RIAs from our comprehensive analysis

-- Insert the remaining St. Louis RIAs (firms 11-20 from our analysis)
INSERT INTO public.ria_profiles (crd_number, legal_name, city, state, aum, private_fund_count, private_fund_aum, last_private_fund_analysis)
VALUES 
  (999010, 'HARBOUR GROUP INDUSTRIES, INC.', 'ST. LOUIS', 'MO', 500000000, 4, 405851000, '2025-08-04'),
  (999011, 'ANDERSON HOAGLAND & CO', 'ST LOUIS', 'MO', 100000000, 4, 48315200, '2025-08-04'),
  (999012, 'FOURTHSTONE LLC', 'ST. LOUIS', 'MO', 1200000000, 3, 957442034, '2025-08-04'),
  (999013, 'PROFUSION FINANCIAL, INC.', 'ST. LOUIS', 'MO', 150000000, 3, 80051000, '2025-08-04'),
  (999014, 'STIEVEN CAPITAL ADVISORS, L.P.', 'ST. LOUIS', 'MO', 800000000, 2, 564739757, '2025-08-04'),
  (999015, 'WILSQUARE CAPITAL LLC', 'ST. LOUIS', 'MO', 250000000, 2, 138684156, '2025-08-04'),
  (999016, 'ASCENSION INVESTMENT MANAGEMENT, LLC', 'ST. LOUIS', 'MO', 16000000000, 1, 14798521234, '2025-08-04'),
  (999017, 'SPARROW CAPITAL MANAGEMENT INC', 'ST. LOUIS', 'MO', 25000000, 1, 8410362, '2025-08-04'),
  (999018, 'DAYTONA STREET CAPITAL LLC', 'SAINT LOUIS', 'MO', 15000000, 1, 4267668, '2025-08-04'),
  (999019, 'SIGNIFY WEALTH LLC', 'ST. LOUIS', 'MO', 10000000, 1, 915000, '2025-08-04')
ON CONFLICT (crd_number) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  aum = EXCLUDED.aum,
  private_fund_count = EXCLUDED.private_fund_count,
  private_fund_aum = EXCLUDED.private_fund_aum,
  last_private_fund_analysis = EXCLUDED.last_private_fund_analysis;

-- Verify we now have all 20 St. Louis RIAs
-- SELECT legal_name, private_fund_count, private_fund_aum 
-- FROM public.ria_profiles 
-- WHERE state = 'MO' AND private_fund_count > 0 
-- ORDER BY private_fund_count DESC;