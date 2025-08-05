#!/usr/bin/env python3
"""
Build narratives from RIA profiles and additional data sources.
"""

import os
import sys
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from rich.console import Console

console = Console()

def build_narrative(row):
    """Build a narrative text from an RIA profile row."""
    parts = []
    
    # Company introduction
    if row.get('firm_name'):
        parts.append(f"{row['firm_name']} is a registered investment adviser")
        
    # Location
    location_parts = []
    if row.get('city') and pd.notna(row['city']):
        location_parts.append(str(row['city']))
    if row.get('state') and pd.notna(row['state']):
        location_parts.append(str(row['state']))
    if location_parts:
        parts.append(f"located in {', '.join(location_parts)}")
    
    # CRD and SEC numbers
    identifiers = []
    if row.get('crd_number'):
        identifiers.append(f"CRD number {row['crd_number']}")
    if row.get('sec_number'):
        identifiers.append(f"SEC file number {row['sec_number']}")
    if identifiers:
        parts.append(f"with {' and '.join(identifiers)}")
    
    # AUM
    if row.get('aum') and row['aum'] > 0:
        # Format AUM nicely
        aum = row['aum']
        if aum >= 1_000_000_000:
            aum_str = f"${aum/1_000_000_000:.1f} billion"
        elif aum >= 1_000_000:
            aum_str = f"${aum/1_000_000:.1f} million"
        else:
            aum_str = f"${aum:,.0f}"
        parts.append(f"managing {aum_str} in assets")
    
    # Employee count
    if row.get('employee_count') and row['employee_count'] > 0:
        parts.append(f"with {row['employee_count']} employees")
    
    # Services
    if row.get('services') and pd.notna(row['services']):
        services = str(row['services']).strip()
        if services:
            parts.append(f"offering services including {services.lower()}")
    
    # Client types
    if row.get('client_types') and pd.notna(row['client_types']):
        client_types = str(row['client_types']).strip()
        if client_types:
            parts.append(f"serving {client_types.lower()}")
    
    # Combine all parts
    if parts:
        narrative = ". ".join(parts) + "."
        # Clean up any double periods
        narrative = narrative.replace("..", ".")
        return narrative
    
    return ""

def extract_brochure_narratives(raw_dir: Path):
    """Extract narratives from ADV brochures if available."""
    narratives = []
    
    # Look for brochure directories
    brochure_dirs = [d for d in raw_dir.iterdir() 
                     if d.is_dir() and 'brochure' in d.name.lower()]
    
    if brochure_dirs:
        console.print(f"[blue]Found {len(brochure_dirs)} brochure directories[/blue]")
        # This would require parsing PDF/text brochures - placeholder for now
        console.print("[yellow]Brochure parsing not implemented yet[/yellow]")
    
    return narratives

def extract_form_crs_narratives(raw_dir: Path):
    """Extract narratives from Form CRS files."""
    narratives = []
    
    # Look for CRS files
    crs_files = list(raw_dir.glob("FIRM_CRS_*.csv"))
    
    for crs_file in crs_files:
        try:
            df = pd.read_csv(crs_file, encoding='latin1', low_memory=False)
            console.print(f"[blue]Processing {crs_file.name} with {len(df)} records[/blue]")
            
            # Form CRS contains relationship summaries - extract relevant text
            # The actual column names would need to be determined from the files
            text_columns = [col for col in df.columns if any(
                keyword in col.lower() for keyword in ['summary', 'description', 'text', 'narrative']
            )]
            
            if text_columns:
                for _, row in df.iterrows():
                    for col in text_columns:
                        if pd.notna(row.get(col)):
                            narratives.append({
                                'source': crs_file.name,
                                'text': str(row[col])
                            })
            
        except Exception as e:
            console.print(f"[yellow]Warning: Error processing {crs_file}: {e}[/yellow]")
    
    return narratives

def main():
    if len(sys.argv) < 3:
        console.print("[red]Usage: python build_narratives.py <input_dir> <output_file>[/red]")
        sys.exit(1)
    
    input_dir = Path(sys.argv[1])
    output_file = Path(sys.argv[2])
    
    # Load the RIA profiles
    profiles_file = Path("output/ria_profiles.csv")
    if not profiles_file.exists():
        console.print(f"[red]Error: {profiles_file} not found. Run apply_mappings.py first.[/red]")
        sys.exit(1)
    
    console.print(f"[blue]Loading RIA profiles from {profiles_file}...[/blue]")
    df = pd.read_csv(profiles_file)
    
    # Build narratives from profiles
    console.print("[blue]Building narratives from RIA profiles...[/blue]")
    profile_narratives = []
    
    for _, row in df.iterrows():
        narrative = build_narrative(row)
        if narrative and row.get('crd_number'):
            profile_narratives.append({
                'crd_number': str(row['crd_number']),
                'narrative': narrative,
                'source': 'ria_profile'
            })
    
    console.print(f"[green]✓ Built {len(profile_narratives)} profile narratives[/green]")
    
    # Extract additional narratives from raw data
    raw_dir = Path("raw")
    
    # Extract from brochures
    brochure_narratives = extract_brochure_narratives(raw_dir)
    console.print(f"[green]✓ Extracted {len(brochure_narratives)} brochure narratives[/green]")
    
    # Extract from Form CRS
    crs_narratives = extract_form_crs_narratives(raw_dir)
    console.print(f"[green]✓ Extracted {len(crs_narratives)} Form CRS narratives[/green]")
    
    # Combine all narratives
    all_narratives = profile_narratives + brochure_narratives + crs_narratives
    
    # Save to output file
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump(all_narratives, f, indent=2)
    
    console.print(f"\n[bold green]Narrative building complete![/bold green]")
    console.print(f"Total narratives: {len(all_narratives)}")
    console.print(f"Output saved to: {output_file}")

if __name__ == "__main__":
    main()