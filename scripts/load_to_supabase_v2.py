#!/usr/bin/env python3
"""
Load processed RIA data into Supabase using the Supabase client with proper upsert logic.
This version uses the Supabase Python client which is simpler than raw SQLAlchemy.
"""

import os
import sys
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from supabase import create_client, Client
from rich.console import Console
from rich.progress import track
import numpy as np
from dotenv import load_dotenv

console = Console()

# Load environment variables
load_dotenv('env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase credentials[/red]")
    sys.exit(1)

# Create Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def clean_value(value):
    """Clean pandas/numpy values for database insertion."""
    if pd.isna(value) or value is None:
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, (int, float)) and np.isnan(value):
        return None
    return value

def batch_upsert(table_name, data, on_conflict, batch_size=1000):
    """Perform batch upsert operations."""
    total = len(data)
    console.print(f"[blue]Upserting {total} records to {table_name}...[/blue]")
    
    for i in range(0, total, batch_size):
        batch = data[i:i + batch_size]
        try:
            response = supabase.table(table_name).upsert(batch, on_conflict=on_conflict).execute()
        except Exception as e:
            console.print(f"[red]Error in batch {i//batch_size + 1}: {e}[/red]")
            # Try smaller batches on error
            for record in batch:
                try:
                    supabase.table(table_name).upsert([record], on_conflict=on_conflict).execute()
                except Exception as e2:
                    console.print(f"[red]Failed record: {record.get('cik', 'unknown')}: {e2}[/red]")

def load_advisers(df):
    """Load adviser data with upsert logic."""
    console.print("[blue]Preparing adviser data...[/blue]")
    
    advisers_data = []
    
    for _, row in df.iterrows():
        # Use CRD number as CIK if available
        crd = str(row.get('crd_number', ''))
        
        # Skip if no valid CRD
        if crd == 'N' or not crd or pd.isna(row.get('crd_number')):
            # For now, skip records without CRD
            # In production, we might generate a unique ID
            continue
        
        adviser = {
            'cik': crd,  # Using CRD as CIK for now
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
    batch_upsert('advisers', unique_advisers, on_conflict='cik')
    
    console.print(f"[green]✓ Processed {len(unique_advisers)} unique advisers[/green]")
    
    # Get adviser IDs for foreign key references
    response = supabase.table('advisers').select('adviser_pk, cik').execute()
    return {row['cik']: row['adviser_pk'] for row in response.data}

def load_filings(df, adviser_map):
    """Load filing data."""
    console.print("[blue]Preparing filing data...[/blue]")
    
    filings_data = []
    
    for _, row in df.iterrows():
        # Get CRD for this row
        crd = str(row.get('crd_number', ''))
        
        if crd == 'N' or not crd or pd.isna(row.get('crd_number')):
            continue
            
        if crd not in adviser_map:
            continue
            
        filing = {
            'adviser_fk': adviser_map[crd],
            'filing_date': datetime.now().date().isoformat(),
            'report_period_end_date': datetime.now().date().isoformat(),
            'form_type': 'ADV',
            'total_aum': int(clean_value(row.get('aum', 0)) or 0),
            'employee_count': int(clean_value(row.get('employee_count', 0)) or 0),
            'services': clean_value(row.get('services')),
            'client_types': clean_value(row.get('client_types')),
            'source_file_name': 'ria_profiles.csv'
        }
        filings_data.append(filing)
    
    # For filings, we don't have a unique constraint, so we'll check existing first
    # Get existing filings for these advisers
    adviser_fks = list(set(f['adviser_fk'] for f in filings_data))
    existing = supabase.table('filings').select('adviser_fk').in_('adviser_fk', adviser_fks).execute()
    existing_adviser_fks = set(row['adviser_fk'] for row in existing.data)
    
    # Only insert new filings
    new_filings = [f for f in filings_data if f['adviser_fk'] not in existing_adviser_fks]
    
    if new_filings:
        # Batch insert new filings
        for i in range(0, len(new_filings), 1000):
            batch = new_filings[i:i + 1000]
            try:
                supabase.table('filings').insert(batch).execute()
            except Exception as e:
                console.print(f"[red]Error inserting filings batch: {e}[/red]")
    
    console.print(f"[green]✓ Loaded {len(new_filings)} new filings[/green]")
    
    # Get filing IDs for narrative loading
    response = supabase.table('filings').select('filing_pk, adviser_fk').execute()
    return {row['adviser_fk']: row['filing_pk'] for row in response.data}

def load_narratives(narratives_file, adviser_map, filing_map):
    """Load narrative data."""
    console.print("[blue]Loading narratives...[/blue]")
    
    with open(narratives_file, 'r') as f:
        narratives = json.load(f)
    
    narratives_data = []
    
    for narrative in narratives:
        crd = str(narrative.get('crd_number', ''))
        
        if crd == 'N' or not crd or crd not in adviser_map:
            continue
            
        adviser_fk = adviser_map[crd]
        filing_fk = filing_map.get(adviser_fk)
        
        if not filing_fk:
            continue
            
        narrative_record = {
            'adviser_fk': adviser_fk,
            'filing_fk': filing_fk,
            'narrative_type': 'profile',
            'narrative_text': narrative.get('narrative'),
            'source': narrative.get('source', 'ria_profile')
        }
        narratives_data.append(narrative_record)
    
    # Check for existing narratives to avoid duplicates
    if narratives_data:
        filing_fks = list(set(n['filing_fk'] for n in narratives_data))
        existing = supabase.table('ria_narratives').select('filing_fk').in_('filing_fk', filing_fks).execute()
        existing_filing_fks = set(row['filing_fk'] for row in existing.data)
        
        # Only insert new narratives
        new_narratives = [n for n in narratives_data if n['filing_fk'] not in existing_filing_fks]
        
        if new_narratives:
            for i in range(0, len(new_narratives), 500):
                batch = new_narratives[i:i + 500]
                try:
                    supabase.table('ria_narratives').insert(batch).execute()
                except Exception as e:
                    console.print(f"[red]Error inserting narratives batch: {e}[/red]")
        
        console.print(f"[green]✓ Loaded {len(new_narratives)} new narratives[/green]")
    else:
        console.print("[yellow]No narratives to load[/yellow]")

def main():
    """Main ETL pipeline."""
    console.print("[bold blue]Starting RIA data load to Supabase...[/bold blue]")
    
    # Check current status
    try:
        advisers_count = supabase.table('advisers').select('*', count='exact').limit(0).execute().count
        filings_count = supabase.table('filings').select('*', count='exact').limit(0).execute().count
        
        try:
            narratives_count = supabase.table('ria_narratives').select('*', count='exact').limit(0).execute().count
        except:
            narratives_count = 0
            console.print("[yellow]Note: ria_narratives table does not exist yet[/yellow]")
        
        console.print(f"\n[blue]Current database status:[/blue]")
        console.print(f"  Advisers: {advisers_count:,}")
        console.print(f"  Filings: {filings_count:,}")
        console.print(f"  Narratives: {narratives_count:,}")
        console.print()
        
    except Exception as e:
        console.print(f"[red]Error checking database status: {e}[/red]")
        console.print("[yellow]Make sure the tables exist in Supabase[/yellow]")
        return
    
    # Load data files
    profiles_file = Path("output/ria_profiles.csv")
    narratives_file = Path("output/narratives.json")
    
    if not profiles_file.exists():
        console.print(f"[red]Error: {profiles_file} not found. Run the ETL pipeline first.[/red]")
        return
        
    console.print("[blue]Loading data files...[/blue]")
    df = pd.read_csv(profiles_file)
    console.print(f"[green]✓ Loaded {len(df)} profiles from CSV[/green]")
    
    # Load data in order
    try:
        # Load advisers
        adviser_map = load_advisers(df)
        
        # Load filings
        filing_map = load_filings(df, adviser_map)
        
        # Load narratives if file exists
        if narratives_file.exists():
            load_narratives(narratives_file, adviser_map, filing_map)
        
        # Show final summary
        console.print("\n[bold green]Data loading complete![/bold green]")
        
        # Get final counts
        advisers_final = supabase.table('advisers').select('*', count='exact').limit(0).execute().count
        filings_final = supabase.table('filings').select('*', count='exact').limit(0).execute().count
        try:
            narratives_final = supabase.table('ria_narratives').select('*', count='exact').limit(0).execute().count
        except:
            narratives_final = 0
        
        console.print(f"\n[blue]Final database status:[/blue]")
        console.print(f"  Advisers: {advisers_final:,} (added {advisers_final - advisers_count:,})")
        console.print(f"  Filings: {filings_final:,} (added {filings_final - filings_count:,})")
        console.print(f"  Narratives: {narratives_final:,} (added {narratives_final - narratives_count:,})")
        
    except Exception as e:
        console.print(f"[red]Error during data loading: {e}[/red]")
        raise

if __name__ == "__main__":
    main()