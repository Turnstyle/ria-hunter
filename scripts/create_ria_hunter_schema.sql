-- RIA Hunter Supabase Schema
-- Based on SEC Data ETL Refinement.md from archived plans
-- This implements a proper relational schema for tracking RIAs over time

-- Drop existing tables if they exist (CASCADE to handle foreign key dependencies)
DROP TABLE IF EXISTS private_funds CASCADE;
DROP TABLE IF EXISTS filings CASCADE;
DROP TABLE IF EXISTS advisers CASCADE;

-- Create advisers table
-- This is the core entity representing an RIA firm
CREATE TABLE advisers (
    adviser_pk SERIAL PRIMARY KEY,
    cik TEXT UNIQUE NOT NULL,  -- Central Index Key (or CRD number if CIK not available)
    legal_name TEXT,
    main_addr_street1 TEXT,
    main_addr_city TEXT,
    main_addr_state TEXT,
    main_addr_zip TEXT,
    main_addr_country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_advisers_cik ON advisers(cik);
CREATE INDEX idx_advisers_legal_name ON advisers(legal_name);
CREATE INDEX idx_advisers_state ON advisers(main_addr_state);
CREATE INDEX idx_advisers_zip ON advisers(main_addr_zip);

-- Create filings table
-- Tracks each Form ADV filing over time
CREATE TABLE filings (
    filing_pk SERIAL PRIMARY KEY,
    adviser_fk INTEGER NOT NULL REFERENCES advisers(adviser_pk) ON DELETE CASCADE,
    filing_date DATE NOT NULL,
    report_period_end_date DATE,
    form_type TEXT,
    total_aum BIGINT,  -- Total Assets Under Management in dollars
    employee_count INTEGER,
    client_count INTEGER,
    services TEXT,  -- Comma-separated list of services offered
    client_types TEXT,  -- Comma-separated list of client types
    source_file_url TEXT,
    source_file_name TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for filings
CREATE INDEX idx_filings_adviser_fk ON filings(adviser_fk);
CREATE INDEX idx_filings_filing_date ON filings(filing_date);
CREATE INDEX idx_filings_report_period_end_date ON filings(report_period_end_date);
CREATE INDEX idx_filings_total_aum ON filings(total_aum);

-- Create private_funds table
-- Details about private funds managed by the adviser (from Schedule D Section 7.B.1)
CREATE TABLE private_funds (
    private_fund_pk SERIAL PRIMARY KEY,
    filing_fk INTEGER NOT NULL REFERENCES filings(filing_pk) ON DELETE CASCADE,
    sec_pf_id TEXT NOT NULL,  -- SEC-generated Private Fund ID
    fund_name TEXT,
    fund_type TEXT,  -- e.g., "Hedge Fund", "Private Equity Fund"
    gross_asset_value NUMERIC,
    min_investment NUMERIC,
    auditor_name TEXT,
    auditor_location TEXT,
    prime_broker_json JSONB,  -- Can have multiple prime brokers
    custodian_json JSONB,  -- Can have multiple custodians
    is_subject_to_audit BOOLEAN,
    UNIQUE(filing_fk, sec_pf_id)  -- Ensure unique fund per filing
);

-- Create indexes for private_funds
CREATE INDEX idx_private_funds_filing_fk ON private_funds(filing_fk);
CREATE INDEX idx_private_funds_sec_pf_id ON private_funds(sec_pf_id);
CREATE INDEX idx_private_funds_fund_type ON private_funds(fund_type);
CREATE INDEX idx_private_funds_gross_asset_value ON private_funds(gross_asset_value);

-- Create narratives table for text content that will be embedded
CREATE TABLE ria_narratives (
    narrative_pk SERIAL PRIMARY KEY,
    adviser_fk INTEGER REFERENCES advisers(adviser_pk) ON DELETE CASCADE,
    filing_fk INTEGER REFERENCES filings(filing_pk) ON DELETE CASCADE,
    narrative_type TEXT,  -- 'profile', 'brochure', 'crs', etc.
    narrative_text TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ria_narratives_adviser_fk ON ria_narratives(adviser_fk);
CREATE INDEX idx_ria_narratives_filing_fk ON ria_narratives(filing_fk);
CREATE INDEX idx_ria_narratives_type ON ria_narratives(narrative_type);

-- Create a view for the latest filing per adviser
-- This makes it easy to get current information
CREATE OR REPLACE VIEW latest_adviser_filings AS
SELECT DISTINCT ON (a.adviser_pk)
    a.*,
    f.filing_pk,
    f.filing_date,
    f.report_period_end_date,
    f.total_aum,
    f.employee_count,
    f.client_count,
    f.services,
    f.client_types,
    f.form_type
FROM advisers a
LEFT JOIN filings f ON a.adviser_pk = f.adviser_fk
ORDER BY a.adviser_pk, f.filing_date DESC NULLS LAST;

-- Create a view for advisers with private funds
CREATE OR REPLACE VIEW advisers_with_private_funds AS
SELECT DISTINCT
    a.adviser_pk,
    a.cik,
    a.legal_name,
    a.main_addr_city,
    a.main_addr_state,
    COUNT(DISTINCT pf.private_fund_pk) as fund_count,
    SUM(pf.gross_asset_value) as total_fund_assets
FROM advisers a
JOIN filings f ON a.adviser_pk = f.adviser_fk
JOIN private_funds pf ON f.filing_pk = pf.filing_fk
GROUP BY a.adviser_pk, a.cik, a.legal_name, a.main_addr_city, a.main_addr_state;

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_advisers_updated_at BEFORE UPDATE ON advisers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Future: Enable RLS when needed
-- ALTER TABLE advisers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE private_funds ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ria_narratives ENABLE ROW LEVEL SECURITY;