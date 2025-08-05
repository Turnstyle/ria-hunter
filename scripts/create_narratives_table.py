#!/usr/bin/env python3
"""
Create the missing ria_narratives table in Supabase.
"""

import os
from rich.console import Console

console = Console()

SQL = """
-- Add the missing ria_narratives table

CREATE TABLE IF NOT EXISTS ria_narratives (
    narrative_pk SERIAL PRIMARY KEY,
    adviser_fk INTEGER REFERENCES advisers(adviser_pk) ON DELETE CASCADE,
    filing_fk INTEGER REFERENCES filings(filing_pk) ON DELETE CASCADE,
    narrative_type TEXT,  -- 'profile', 'brochure', 'crs', etc.
    narrative_text TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ria_narratives_adviser_fk ON ria_narratives(adviser_fk);
CREATE INDEX IF NOT EXISTS idx_ria_narratives_filing_fk ON ria_narratives(filing_fk);
CREATE INDEX IF NOT EXISTS idx_ria_narratives_type ON ria_narratives(narrative_type);
"""

console.print("[yellow]Please execute the following SQL in Supabase:[/yellow]")
console.print("[blue]Go to: https://app.supabase.com/project/llusjnpltqxhokycwzry/sql[/blue]")
console.print("\n[cyan]Copy and paste this SQL:[/cyan]")
console.print(SQL)
console.print("\n[green]After executing, run scripts/load_to_supabase_v2.py again[/green]")