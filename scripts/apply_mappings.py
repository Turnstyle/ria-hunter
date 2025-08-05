#!/usr/bin/env python3
"""
Apply mappings to normalized SEC data to create the final ria_profiles.csv.
"""

import os
import sys
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from rich.console import Console

console = Console()

def load_mappings(mappings_file: Path) -> dict:
    """Load field mappings from JSON file."""
    with open(mappings_file, 'r') as f:
        return json.load(f)

def map_adv_columns_to_standard(df: pd.DataFrame, mappings: dict) -> pd.DataFrame:
    """Map ADV form columns to standardized column names."""
    
    # Create reverse mapping for easier lookup
    standard_to_source = {}
    for source, standard in mappings.items():
        if standard not in standard_to_source:
            standard_to_source[standard] = []
        standard_to_source[standard].append(source)
    
    # Manual mapping of ADV columns to our standard fields
    adv_to_standard = {
        '1A': 'firm_name',  # Legal name
        '1B1': 'firm_name',  # Primary business name
        '1O': 'crd_number',  # CRD number
        '1P': 'sec_number',  # SEC file number
        '1F1-City': 'city',
        '1F1-State': 'state', 
        '1F1-Postal': 'zip_code',
        '5F2f': 'aum',  # Total AUM
        '5B1a': 'employee_count',  # Total employees
    }
    
    # Create output dataframe with standard columns
    output_data = {}
    
    for adv_col, standard_col in adv_to_standard.items():
        if adv_col in df.columns:
            output_data[standard_col] = df[adv_col]
    
    # Add calculated/derived fields
    output_df = pd.DataFrame(output_data)
    
    # Add additional fields
    if '1F1-Street 1' in df.columns and '1F1-City' in df.columns:
        # Combine address components
        street1 = df['1F1-Street 1'].fillna('')
        street2 = df['1F1-Street 2'].fillna('')
        # Use pandas string operations
        output_df['address'] = street1 + street2.apply(lambda x: ' ' + x if x else '')
    
    # Registration status
    if '2A1' in df.columns:
        output_df['is_registered'] = df['2A1'].notna()
    else:
        output_df['is_registered'] = True
    
    # Services offered based on Part 1A Item 5
    services = []
    service_columns = {
        '5G1': 'Financial Planning',
        '5G2': 'Portfolio Management (Individuals)',
        '5G3': 'Portfolio Management (Businesses)',
        '5G4': 'Pension Consulting',
        '5G5': 'Selection of Other Advisers',
        '5G6': 'Publication of Newsletters',
        '5G7': 'Other Services'
    }
    
    for col, service_name in service_columns.items():
        if col in df.columns:
            # Create a boolean mask for 'Y' values
            mask = df[col] == 'Y'
            if mask.any():
                if 'services' not in output_df.columns:
                    output_df['services'] = ''
                # Add service to rows where it's marked 'Y'
                for idx in df[mask].index:
                    if idx < len(output_df):
                        current = output_df.at[idx, 'services']
                        if current:
                            output_df.at[idx, 'services'] = current + ', ' + service_name
                        else:
                            output_df.at[idx, 'services'] = service_name
    
    # Client types
    client_types = []
    client_columns = {
        '5D1a': 'Individuals (non-high net worth)',
        '5D1b': 'High net worth individuals',
        '5D1c': 'Banking or thrift institutions',
        '5D1d': 'Investment companies',
        '5D1e': 'Business development companies',
        '5D1f': 'Pooled investment vehicles'
    }
    
    for col, client_type in client_columns.items():
        if col in df.columns:
            mask = df[col] > 0  # If they have any clients of this type
            if mask.any():
                if 'client_types' not in output_df.columns:
                    output_df['client_types'] = ''
                for idx in df[mask].index:
                    if idx < len(output_df):
                        current = output_df.at[idx, 'client_types']
                        if current:
                            output_df.at[idx, 'client_types'] = current + ', ' + client_type
                        else:
                            output_df.at[idx, 'client_types'] = client_type
    
    # Add metadata
    output_df['data_source'] = 'SEC IAPD'
    output_df['last_updated'] = datetime.now().strftime('%Y-%m-%d')
    
    # Clean up
    output_df = output_df.fillna('')
    
    # Convert AUM to numeric if possible
    if 'aum' in output_df.columns:
        output_df['aum'] = pd.to_numeric(output_df['aum'], errors='coerce').fillna(0).astype(int)
    
    # Convert employee count to numeric
    if 'employee_count' in output_df.columns:
        output_df['employee_count'] = pd.to_numeric(output_df['employee_count'], errors='coerce').fillna(0).astype(int)
    
    return output_df

def main():
    if len(sys.argv) < 4:
        console.print("[red]Usage: python apply_mappings.py <input_dir> <mappings_file> <output_file>[/red]")
        sys.exit(1)
    
    input_dir = Path(sys.argv[1])
    mappings_file = Path(sys.argv[2])
    output_file = Path(sys.argv[3])
    
    # Load data
    input_file = input_dir / 'adv_base_combined.csv'
    if not input_file.exists():
        console.print(f"[red]Error: Input file {input_file} not found[/red]")
        sys.exit(1)
    
    console.print(f"[blue]Loading data from {input_file}...[/blue]")
    df = pd.read_csv(input_file, low_memory=False)
    
    # Load mappings
    console.print(f"[blue]Loading mappings from {mappings_file}...[/blue]")
    mappings = load_mappings(mappings_file)
    
    # Apply mappings
    console.print("[blue]Applying mappings...[/blue]")
    output_df = map_adv_columns_to_standard(df, mappings)
    
    # Save output
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_df.to_csv(output_file, index=False)
    
    # Summary statistics
    console.print("\n[bold green]Mapping complete![/bold green]")
    console.print(f"Total records: {len(output_df)}")
    console.print(f"Records with CRD number: {output_df['crd_number'].notna().sum() if 'crd_number' in output_df else 'N/A'}")
    console.print(f"Records with AUM > 0: {(output_df['aum'] > 0).sum() if 'aum' in output_df else 0}")
    console.print(f"Available columns: {', '.join(output_df.columns)}")
    console.print(f"Output saved to: {output_file}")

if __name__ == "__main__":
    main()