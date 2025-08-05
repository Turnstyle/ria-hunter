#!/usr/bin/env python3
"""
Extract SEC IAPD data from raw monthly files and normalize into intermediate format.
"""

import os
import sys
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.progress import track

console = Console()

def extract_adv_base_data(raw_dir: Path, output_dir: Path):
    """Extract and combine ADV Base A data from all monthly directories."""
    
    console.print("[bold blue]Starting SEC data extraction...[/bold blue]")
    
    # Find all ADV filing directories
    adv_dirs = [d for d in raw_dir.iterdir() 
                if d.is_dir() and d.name.startswith(('ADV_Filing_Data_', 'adv-filing-data-'))]
    
    console.print(f"Found {len(adv_dirs)} ADV filing directories")
    
    all_data = []
    
    for dir_path in track(adv_dirs, description="Processing directories..."):
        # Look for IA_ADV_Base_A file
        base_files = list(dir_path.glob("IA_ADV_Base_A_*.csv"))
        
        if not base_files:
            console.print(f"[yellow]Warning: No base file found in {dir_path.name}[/yellow]")
            continue
            
        base_file = base_files[0]
        console.print(f"Processing {base_file.name}")
        
        try:
            # Read the CSV with proper encoding
            df = pd.read_csv(base_file, encoding='latin1', low_memory=False)
            
            # First, let's see what columns we have
            if len(all_data) == 0:
                console.print(f"[cyan]Available columns: {', '.join(df.columns[:20])}...[/cyan]")
            
            # Don't filter columns - keep all for now to debug
            df_filtered = df.copy()
            
            # Add source file info
            df_filtered['source_file'] = base_file.name
            df_filtered['filing_period'] = dir_path.name
            
            all_data.append(df_filtered)
            
        except Exception as e:
            console.print(f"[red]Error processing {base_file}: {e}[/red]")
            continue
    
    if not all_data:
        console.print("[red]No data extracted![/red]")
        return None
        
    # Combine all data
    console.print("Combining all data...")
    combined_df = pd.concat(all_data, ignore_index=True)
    
    # Remove duplicates based on FilingID, keeping latest
    if 'FilingID' in combined_df.columns:
        combined_df = combined_df.sort_values('source_file').drop_duplicates(subset=['FilingID'], keep='last')
    
    # Log available columns for debugging
    console.print(f"[cyan]Combined dataframe has {len(combined_df.columns)} columns[/cyan]")
    console.print(f"[cyan]Sample columns: {', '.join(list(combined_df.columns)[:30])}...[/cyan]")
    
    # Save intermediate data
    output_file = output_dir / 'adv_base_combined.csv'
    combined_df.to_csv(output_file, index=False)
    
    console.print(f"[green]✓ Extracted {len(combined_df)} unique advisers[/green]")
    console.print(f"[green]✓ Saved to {output_file}[/green]")
    
    return combined_df

def extract_schedule_d_data(raw_dir: Path, output_dir: Path):
    """Extract Schedule D data for narratives."""
    
    console.print("[bold blue]Extracting Schedule D data...[/bold blue]")
    
    # We'll focus on specific Schedule D files that contain narrative-like content
    narrative_files = [
        'IA_Schedule_D_Miscellaneous_*.csv',  # Contains brochure info
        'IA_Schedule_D_2A_*.csv',  # Registration info
    ]
    
    all_narratives = []
    
    for dir_path in raw_dir.iterdir():
        if not dir_path.is_dir() or not dir_path.name.startswith(('ADV_Filing_Data_', 'adv-filing-data-')):
            continue
            
        for pattern in narrative_files:
            files = list(dir_path.glob(pattern))
            
            for file in files:
                try:
                    df = pd.read_csv(file, encoding='latin1', low_memory=False)
                    
                    # Extract narrative-like columns (adjust based on actual content)
                    if 'Miscellaneous' in file.name and len(df) > 0:
                        # This file often contains brochure/narrative info
                        narrative_cols = [col for col in df.columns if 'description' in col.lower() or 'narrative' in col.lower()]
                        if narrative_cols:
                            for _, row in df.iterrows():
                                for col in narrative_cols:
                                    if pd.notna(row.get(col)):
                                        all_narratives.append({
                                            'source': file.name,
                                            'text': str(row[col])
                                        })
                                        
                except Exception as e:
                    console.print(f"[yellow]Warning: Error processing {file}: {e}[/yellow]")
                    continue
    
    # Save narratives
    output_file = output_dir / 'schedule_d_narratives.json'
    with open(output_file, 'w') as f:
        json.dump(all_narratives, f, indent=2)
        
    console.print(f"[green]✓ Extracted {len(all_narratives)} narrative segments[/green]")
    
    return all_narratives

def main():
    if len(sys.argv) < 3:
        console.print("[red]Usage: python extract_sec.py <raw_dir> <output_dir>[/red]")
        sys.exit(1)
        
    raw_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    
    if not raw_dir.exists():
        console.print(f"[red]Error: Raw directory {raw_dir} does not exist[/red]")
        sys.exit(1)
        
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Extract data
    adv_data = extract_adv_base_data(raw_dir, output_dir)
    schedule_d_data = extract_schedule_d_data(raw_dir, output_dir)
    
    # Summary
    console.print("\n[bold green]Extraction complete![/bold green]")
    console.print(f"ADV Base records: {len(adv_data) if adv_data is not None else 0}")
    console.print(f"Schedule D narratives: {len(schedule_d_data) if schedule_d_data else 0}")

if __name__ == "__main__":
    main()