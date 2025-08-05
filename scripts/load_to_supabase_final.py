#!/usr/bin/env python3
"""
Final version of RIA data loader that handles the actual data we have.
Uses SEC number (LEI) as primary identifier since CRD numbers are not available.
"""

import os
import sys
import pandas as pd
import json
import hashlib
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
    return str(value).strip() if value else None

def generate_unique_id(row):
    """Generate a unique ID for advisers without proper identifiers."""
    # Use a combination of firm name and location
    firm_name = str(row.get('firm_name', '')).strip()
    city = str(row.get('city', '')).strip()
    state = str(row.get('state', '')).strip()
    
    # Create a hash of these values
    unique_string = f"{firm_name}|{city}|{state}"
    return f"GEN_{hashlib.md5(unique_string.encode()).hexdigest()[:12].upper()}"

def load_advisers(df):
    """Load adviser data with proper identifier handling."""
    console.print("[blue]Preparing adviser data...[/blue]")
    
    advisers_data = []
    skipped = 0
    
    for _, row in df.iterrows():
        # Try to find a valid identifier
        sec_number = clean_value(row.get('sec_number'))
        firm_name = clean_value(row.get('firm_name'))
        
        # Skip if no firm name
        if not firm_name:
            skipped += 1
            continue
        
        # Use SEC number as CIK if available and valid
        if sec_number and sec_number not in ['NONE', 'None', '']:
            cik = sec_number
        else:
            # Generate a unique ID based on firm info
            cik = generate_unique_id(row)
        
        adviser = {
            'cik': cik,
            'legal_name': firm_name,
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
    
    console.print(f"[yellow]Skipped {skipped} records without firm names[/yellow]")
    console.print(f"[blue]Upserting {len(unique_advisers)} unique advisers...[/blue]")
    
    # Batch upsert advisers
    batch_size = 500
    for i in range(0, len(unique_advisers), batch_size):
        batch = unique_advisers[i:i + batch_size]
        try:
            response = supabase.table('advisers').upsert(batch, on_conflict='cik').execute()
        except Exception as e:
            console.print(f"[red]Error in batch {i//batch_size + 1}: {e}[/red]")
            # Try individual records on error
            for record in batch:
                try:
                    supabase.table('advisers').upsert([record], on_conflict='cik').execute()
                except Exception as e2:
                    console.print(f"[red]Failed: {record['legal_name']}: {e2}[/red]")
    
    console.print(f"[green]✓ Processed {len(unique_advisers)} unique advisers[/green]")
    
    # Get adviser IDs for foreign key references
    # We need to fetch in batches due to potential size
    all_ciks = [a['cik'] for a in unique_advisers]
    adviser_map = {}
    
    for i in range(0, len(all_ciks), 1000):
        batch_ciks = all_ciks[i:i + 1000]
        response = supabase.table('advisers').select('adviser_pk, cik').in_('cik', batch_ciks).execute()
        adviser_map.update({row['cik']: row['adviser_pk'] for row in response.data})
    
    return adviser_map, unique_advisers

def load_filings(df, adviser_map, unique_advisers):
    """Load filing data for all advisers."""
    console.print("[blue]Preparing filing data...[/blue]")
    
    # Create a lookup for adviser data
    adviser_lookup = {a['cik']: a for a in unique_advisers}
    
    filings_data = []
    
    # Group by our generated CIK to get unique filings
    for cik, adviser_pk in adviser_map.items():
        # Find the original row(s) for this adviser
        adviser_info = adviser_lookup.get(cik)
        if not adviser_info:
            continue
        
        # Find matching rows in original dataframe
        matching_rows = df[
            (df['firm_name'] == adviser_info['legal_name']) |
            (df['sec_number'] == cik)
        ]
        
        if len(matching_rows) == 0:
            continue
        
        # Use the first matching row for filing data
        row = matching_rows.iloc[0]
        
        filing = {
            'adviser_fk': adviser_pk,
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
    
    # Check for existing filings
    if filings_data:
        adviser_fks = list(set(f['adviser_fk'] for f in filings_data))
        
        # Fetch existing in batches
        existing_adviser_fks = set()
        for i in range(0, len(adviser_fks), 1000):
            batch_fks = adviser_fks[i:i + 1000]
            response = supabase.table('filings').select('adviser_fk').in_('adviser_fk', batch_fks).execute()
            existing_adviser_fks.update(row['adviser_fk'] for row in response.data)
        
        # Only insert new filings
        new_filings = [f for f in filings_data if f['adviser_fk'] not in existing_adviser_fks]
        
        if new_filings:
            console.print(f"[blue]Inserting {len(new_filings)} new filings...[/blue]")
            for i in range(0, len(new_filings), 500):
                batch = new_filings[i:i + 500]
                try:
                    supabase.table('filings').insert(batch).execute()
                except Exception as e:
                    console.print(f"[red]Error inserting filings batch: {e}[/red]")
        
        console.print(f"[green]✓ Loaded {len(new_filings)} new filings[/green]")
    else:
        console.print("[yellow]No filings to load[/yellow]")
    
    # Get filing IDs
    response = supabase.table('filings').select('filing_pk, adviser_fk').execute()
    return {row['adviser_fk']: row['filing_pk'] for row in response.data}

def load_narratives(narratives_file, df, adviser_map, filing_map, unique_advisers):
    """Load narrative data with proper mapping."""
    console.print("[blue]Loading narratives...[/blue]")
    
    if not narratives_file.exists():
        console.print("[yellow]No narratives file found[/yellow]")
        return
    
    with open(narratives_file, 'r') as f:
        narratives = json.load(f)
    
    # Create lookup for matching narratives to advisers
    adviser_lookup = {a['cik']: a for a in unique_advisers}
    
    narratives_data = []
    unmatched = 0
    
    # We need to match narratives to advisers based on the original data
    for i, narrative in enumerate(narratives):
        # The narrative was created from the same row index in the original CSV
        if i < len(df):
            row = df.iloc[i]
            
            # Generate the same CIK we would have used for this row
            sec_number = clean_value(row.get('sec_number'))
            if sec_number and sec_number not in ['NONE', 'None', '']:
                cik = sec_number
            else:
                cik = generate_unique_id(row)
            
            if cik in adviser_map:
                adviser_fk = adviser_map[cik]
                filing_fk = filing_map.get(adviser_fk)
                
                if filing_fk:
                    narrative_record = {
                        'adviser_fk': adviser_fk,
                        'filing_fk': filing_fk,
                        'narrative_type': 'profile',
                        'narrative_text': narrative.get('narrative'),
                        'source': narrative.get('source', 'ria_profile')
                    }
                    narratives_data.append(narrative_record)
                else:
                    unmatched += 1
            else:
                unmatched += 1
    
    console.print(f"[yellow]Unmatched narratives: {unmatched}[/yellow]")
    
    # Skip if table doesn't exist
    try:
        # Check for existing narratives
        if narratives_data:
            filing_fks = list(set(n['filing_fk'] for n in narratives_data))
            
            existing_filing_fks = set()
            for i in range(0, len(filing_fks), 1000):
                batch_fks = filing_fks[i:i + 1000]
                response = supabase.table('ria_narratives').select('filing_fk').in_('filing_fk', batch_fks).execute()
                existing_filing_fks.update(row['filing_fk'] for row in response.data)
            
            # Only insert new narratives
            new_narratives = [n for n in narratives_data if n['filing_fk'] not in existing_filing_fks]
            
            if new_narratives:
                console.print(f"[blue]Inserting {len(new_narratives)} new narratives...[/blue]")
                for i in range(0, len(new_narratives), 250):
                    batch = new_narratives[i:i + 250]
                    try:
                        supabase.table('ria_narratives').insert(batch).execute()
                    except Exception as e:
                        console.print(f"[red]Error inserting narratives batch: {e}[/red]")
                
                console.print(f"[green]✓ Loaded {len(new_narratives)} new narratives[/green]")
            else:
                console.print("[yellow]All narratives already exist[/yellow]")
    except Exception as e:
        if 'does not exist' in str(e):
            console.print("[yellow]ria_narratives table does not exist - skipping narratives[/yellow]")
            console.print("[yellow]Run scripts/add_narratives_table.sql in Supabase to create it[/yellow]")
        else:
            console.print(f"[red]Error loading narratives: {e}[/red]")

def main():
    """Main ETL pipeline."""
    console.print("[bold blue]Starting RIA data load to Supabase (Final Version)...[/bold blue]")
    
    # Load data files
    profiles_file = Path("output/ria_profiles.csv")
    narratives_file = Path("output/narratives.json")
    
    if not profiles_file.exists():
        console.print(f"[red]Error: {profiles_file} not found. Run the ETL pipeline first.[/red]")
        return
        
    console.print("[blue]Loading data files...[/blue]")
    df = pd.read_csv(profiles_file)
    console.print(f"[green]✓ Loaded {len(df)} profiles from CSV[/green]")
    
    # Show data summary
    console.print("\n[blue]Data summary:[/blue]")
    console.print(f"  Records with SEC numbers: {df['sec_number'].notna().sum():,}")
    console.print(f"  Records with AUM > 0: {(df['aum'] > 0).sum():,}")
    console.print(f"  Unique states: {df['state'].nunique()}")
    console.print()
    
    try:
        # Load advisers
        adviser_map, unique_advisers = load_advisers(df)
        
        # Load filings
        filing_map = load_filings(df, adviser_map, unique_advisers)
        
        # Load narratives
        load_narratives(narratives_file, df, adviser_map, filing_map, unique_advisers)
        
        # Show final summary
        console.print("\n[bold green]Data loading complete![/bold green]")
        
        # Get final counts
        advisers_final = supabase.table('advisers').select('*', count='exact').limit(0).execute().count
        filings_final = supabase.table('filings').select('*', count='exact').limit(0).execute().count
        
        console.print(f"\n[blue]Final database status:[/blue]")
        console.print(f"  Advisers: {advisers_final:,}")
        console.print(f"  Filings: {filings_final:,}")
        
        try:
            narratives_final = supabase.table('ria_narratives').select('*', count='exact').limit(0).execute().count
            console.print(f"  Narratives: {narratives_final:,}")
        except:
            console.print(f"  Narratives: [yellow]table not created yet[/yellow]")
        
    except Exception as e:
        console.print(f"[red]Error during data loading: {e}[/red]")
        raise

if __name__ == "__main__":
    main()