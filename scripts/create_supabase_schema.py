#!/usr/bin/env python3
"""
Create Supabase schema for RIA Hunter based on the archived plans.
This implements the relational schema from SEC Data ETL Refinement.md
"""

import os
from supabase import create_client, Client
from rich.console import Console

console = Console()

# Supabase connection
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase credentials in environment[/red]")
    console.print("Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set")
    exit(1)

# Create Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# SQL DDL for creating tables
CREATE_TABLES_SQL = """
-- Drop existing tables if they exist (CASCADE to handle foreign key dependencies)
DROP TABLE IF EXISTS private_funds CASCADE;
DROP TABLE IF EXISTS filings CASCADE;
DROP TABLE IF EXISTS advisers CASCADE;

-- Create advisers table
CREATE TABLE advisers (
    adviser_pk SERIAL PRIMARY KEY,
    cik TEXT UNIQUE NOT NULL,
    legal_name TEXT,
    main_addr_street1 TEXT,
    main_addr_city TEXT,
    main_addr_state TEXT,
    main_addr_zip TEXT,
    main_addr_country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on CIK for fast lookups
CREATE INDEX idx_advisers_cik ON advisers(cik);
CREATE INDEX idx_advisers_legal_name ON advisers(legal_name);

-- Create filings table
CREATE TABLE filings (
    filing_pk SERIAL PRIMARY KEY,
    adviser_fk INTEGER NOT NULL REFERENCES advisers(adviser_pk),
    filing_date DATE NOT NULL,
    report_period_end_date DATE,
    form_type TEXT,
    total_aum BIGINT,
    source_file_url TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for filings
CREATE INDEX idx_filings_adviser_fk ON filings(adviser_fk);
CREATE INDEX idx_filings_filing_date ON filings(filing_date);
CREATE INDEX idx_filings_report_period_end_date ON filings(report_period_end_date);

-- Create private_funds table
CREATE TABLE private_funds (
    private_fund_pk SERIAL PRIMARY KEY,
    filing_fk INTEGER NOT NULL REFERENCES filings(filing_pk),
    sec_pf_id TEXT NOT NULL,
    fund_name TEXT,
    fund_type TEXT,
    gross_asset_value NUMERIC,
    min_investment NUMERIC,
    auditor_name TEXT,
    auditor_location TEXT,
    prime_broker_json JSONB,
    custodian_json JSONB,
    is_subject_to_audit BOOLEAN,
    UNIQUE(filing_fk, sec_pf_id)  -- Ensure unique fund per filing
);

-- Create indexes for private_funds
CREATE INDEX idx_private_funds_filing_fk ON private_funds(filing_fk);
CREATE INDEX idx_private_funds_sec_pf_id ON private_funds(sec_pf_id);
CREATE INDEX idx_private_funds_fund_type ON private_funds(fund_type);
CREATE INDEX idx_private_funds_gross_asset_value ON private_funds(gross_asset_value);

-- Create a view for the latest filing per adviser
CREATE OR REPLACE VIEW latest_adviser_filings AS
SELECT DISTINCT ON (a.adviser_pk)
    a.*,
    f.filing_pk,
    f.filing_date,
    f.report_period_end_date,
    f.total_aum,
    f.form_type
FROM advisers a
LEFT JOIN filings f ON a.adviser_pk = f.adviser_fk
ORDER BY a.adviser_pk, f.filing_date DESC;

-- Create RLS policies (if needed later)
-- ALTER TABLE advisers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE private_funds ENABLE ROW LEVEL SECURITY;
"""

def create_schema():
    """Create the RIA Hunter schema in Supabase."""
    try:
        console.print("[blue]Creating RIA Hunter schema in Supabase...[/blue]")
        
        # Execute the DDL
        # Note: Supabase Python client doesn't have a direct SQL execution method
        # We need to use the REST API directly
        import requests
        
        headers = {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
        
        # Supabase doesn't expose direct SQL execution via the client library
        # We'll need to use a different approach - create tables using the client
        
        console.print("[yellow]Note: Direct SQL execution not available via Supabase Python client.[/yellow]")
        console.print("[yellow]Please execute the following SQL in your Supabase SQL editor:[/yellow]")
        console.print("\n[cyan]-- Copy and paste this SQL into Supabase SQL editor --[/cyan]")
        console.print(CREATE_TABLES_SQL)
        
        # Save SQL to file for convenience
        sql_file = "scripts/create_ria_hunter_schema.sql"
        with open(sql_file, 'w') as f:
            f.write(CREATE_TABLES_SQL)
        
        console.print(f"\n[green]✓ SQL saved to {sql_file}[/green]")
        console.print("[blue]Please go to your Supabase dashboard > SQL Editor and execute this SQL.[/blue]")
        console.print("[blue]Dashboard URL: https://app.supabase.com/project/llusjnpltqxhokycwzry/sql[/blue]")
        
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise

if __name__ == "__main__":
    create_schema()