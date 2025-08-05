#!/usr/bin/env python3
"""
Load processed RIA data into Supabase using SQLAlchemy with proper upsert logic.
Based on the recommendations from SEC Data ETL Refinement.md
"""

import os
import sys
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from sqlalchemy import create_engine, text, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from rich.console import Console
from rich.progress import track
import numpy as np

console = Console()

# Load environment variables
from dotenv import load_dotenv
load_dotenv('env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase credentials[/red]")
    sys.exit(1)

# Extract database connection details from Supabase URL
# Format: https://[project-ref].supabase.co -> postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
project_ref = SUPABASE_URL.split('//')[1].split('.')[0]
db_host = f"db.{project_ref}.supabase.co"
db_url = f"postgresql://postgres.{project_ref}:{SUPABASE_SERVICE_KEY}@{db_host}:5432/postgres"

# Create SQLAlchemy engine
engine = create_engine(db_url, echo=False)

def batch_records(records, batch_size=1000):
    """Yield successive batches from records."""
    for i in range(0, len(records), batch_size):
        yield records[i:i + batch_size]

def clean_value(value):
    """Clean pandas/numpy values for database insertion."""
    if pd.isna(value) or value is None:
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    return value

def load_advisers(session, df):
    """Load adviser data with upsert logic."""
    console.print("[blue]Loading advisers...[/blue]")
    
    advisers_data = []
    
    for _, row in df.iterrows():
        # Use CRD number as CIK if available, otherwise use a generated ID
        cik = str(row.get('crd_number', ''))
        if cik == 'N' or not cik or pd.isna(row.get('crd_number')):
            # Generate a unique ID based on firm name if no CRD
            cik = f"NO_CRD_{hash(row.get('firm_name', '')) % 1000000}"
        
        adviser = {
            'cik': cik,
            'legal_name': clean_value(row.get('firm_name')),
            'main_addr_street1': clean_value(row.get('address')),
            'main_addr_city': clean_value(row.get('city')),
            'main_addr_state': clean_value(row.get('state')),
            'main_addr_zip': clean_value(row.get('zip_code'))
        }
        advisers_data.append(adviser)
    
    # Remove duplicates based on CIK
    seen = set()
    unique_advisers = []
    for adviser in advisers_data:
        if adviser['cik'] not in seen:
            seen.add(adviser['cik'])
            unique_advisers.append(adviser)
    
    # Batch upsert advisers
    for batch in batch_records(unique_advisers):
        stmt = pg_insert(text("advisers")).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=['cik'],
            set_={
                'legal_name': stmt.excluded.legal_name,
                'main_addr_street1': stmt.excluded.main_addr_street1,
                'main_addr_city': stmt.excluded.main_addr_city,
                'main_addr_state': stmt.excluded.main_addr_state,
                'main_addr_zip': stmt.excluded.main_addr_zip,
                'updated_at': text('CURRENT_TIMESTAMP')
            }
        )
        session.execute(stmt)
    
    session.commit()
    console.print(f"[green]✓ Loaded {len(unique_advisers)} advisers[/green]")
    
    # Return mapping of CIK to adviser_pk for foreign key references
    result = session.execute(text("SELECT adviser_pk, cik FROM advisers"))
    return {row.cik: row.adviser_pk for row in result}

def load_filings(session, df, adviser_map):
    """Load filing data."""
    console.print("[blue]Loading filings...[/blue]")
    
    filings_data = []
    
    for _, row in df.iterrows():
        # Get CIK for this row
        cik = str(row.get('crd_number', ''))
        if cik == 'N' or not cik or pd.isna(row.get('crd_number')):
            cik = f"NO_CRD_{hash(row.get('firm_name', '')) % 1000000}"
        
        if cik not in adviser_map:
            continue
            
        filing = {
            'adviser_fk': adviser_map[cik],
            'filing_date': datetime.now().date(),  # Using current date as we don't have actual filing dates
            'report_period_end_date': datetime.now().date(),
            'form_type': 'ADV',
            'total_aum': int(clean_value(row.get('aum', 0)) or 0),
            'employee_count': int(clean_value(row.get('employee_count', 0)) or 0),
            'services': clean_value(row.get('services')),
            'client_types': clean_value(row.get('client_types')),
            'source_file_name': clean_value(row.get('source_file', 'ria_profiles.csv'))
        }
        filings_data.append(filing)
    
    # Batch insert filings
    for batch in batch_records(filings_data):
        session.execute(
            text("""
                INSERT INTO filings 
                (adviser_fk, filing_date, report_period_end_date, form_type, 
                 total_aum, employee_count, services, client_types, source_file_name)
                VALUES 
                (:adviser_fk, :filing_date, :report_period_end_date, :form_type,
                 :total_aum, :employee_count, :services, :client_types, :source_file_name)
            """),
            batch
        )
    
    session.commit()
    console.print(f"[green]✓ Loaded {len(filings_data)} filings[/green]")
    
    # Return mapping for narrative loading
    result = session.execute(
        text("""
            SELECT f.filing_pk, a.cik 
            FROM filings f 
            JOIN advisers a ON f.adviser_fk = a.adviser_pk
        """)
    )
    return {row.cik: row.filing_pk for row in result}

def load_narratives(session, narratives_file, adviser_map, filing_map):
    """Load narrative data."""
    console.print("[blue]Loading narratives...[/blue]")
    
    with open(narratives_file, 'r') as f:
        narratives = json.load(f)
    
    narratives_data = []
    
    for narrative in narratives:
        crd = narrative.get('crd_number', '')
        if crd == 'N' or not crd:
            # Try to match based on narrative content
            continue
            
        if crd in adviser_map and crd in filing_map:
            narrative_record = {
                'adviser_fk': adviser_map[crd],
                'filing_fk': filing_map[crd],
                'narrative_type': 'profile',
                'narrative_text': narrative.get('narrative'),
                'source': narrative.get('source', 'ria_profile')
            }
            narratives_data.append(narrative_record)
    
    # Batch insert narratives
    for batch in batch_records(narratives_data, batch_size=500):
        session.execute(
            text("""
                INSERT INTO ria_narratives 
                (adviser_fk, filing_fk, narrative_type, narrative_text, source)
                VALUES 
                (:adviser_fk, :filing_fk, :narrative_type, :narrative_text, :source)
            """),
            batch
        )
    
    session.commit()
    console.print(f"[green]✓ Loaded {len(narratives_data)} narratives[/green]")

def main():
    """Main ETL pipeline."""
    console.print("[bold blue]Starting RIA data load to Supabase...[/bold blue]")
    
    # Check if tables exist
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('advisers', 'filings', 'private_funds', 'ria_narratives')
            """)
        )
        tables = [row[0] for row in result]
        
        if len(tables) < 4:
            console.print("[red]Error: Required tables not found in Supabase![/red]")
            console.print("[yellow]Please run the SQL script in scripts/create_ria_hunter_schema.sql first.[/yellow]")
            console.print("[yellow]Go to: https://app.supabase.com/project/llusjnpltqxhokycwzry/sql[/yellow]")
            return
    
    # Load data files
    profiles_file = Path("output/ria_profiles.csv")
    narratives_file = Path("output/narratives.json")
    
    if not profiles_file.exists():
        console.print(f"[red]Error: {profiles_file} not found. Run the ETL pipeline first.[/red]")
        return
        
    console.print("[blue]Loading data files...[/blue]")
    df = pd.read_csv(profiles_file)
    console.print(f"[green]✓ Loaded {len(df)} profiles[/green]")
    
    # Start database session
    with Session(engine) as session:
        try:
            # Load data in order (respecting foreign key constraints)
            adviser_map = load_advisers(session, df)
            filing_map = load_filings(session, df, adviser_map)
            
            if narratives_file.exists():
                load_narratives(session, narratives_file, adviser_map, filing_map)
            
            # Show summary
            console.print("\n[bold green]Data loading complete![/bold green]")
            
            # Query counts
            counts = session.execute(
                text("""
                    SELECT 
                        (SELECT COUNT(*) FROM advisers) as adviser_count,
                        (SELECT COUNT(*) FROM filings) as filing_count,
                        (SELECT COUNT(*) FROM ria_narratives) as narrative_count
                """)
            ).fetchone()
            
            console.print(f"Advisers: {counts.adviser_count}")
            console.print(f"Filings: {counts.filing_count}")
            console.print(f"Narratives: {counts.narrative_count}")
            
        except Exception as e:
            session.rollback()
            console.print(f"[red]Error during data loading: {e}[/red]")
            raise

if __name__ == "__main__":
    # Install python-dotenv if needed
    try:
        from dotenv import load_dotenv
    except ImportError:
        console.print("[yellow]Installing python-dotenv...[/yellow]")
        os.system(f"{sys.executable} -m pip install python-dotenv")
        from dotenv import load_dotenv
    
    main()