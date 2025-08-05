#!/usr/bin/env python3
"""
Final corrected script to identify the top St. Louis RIA for private placements.
This version properly identifies and uses adviser names.
"""

import pandas as pd
import numpy as np
from glob import glob
from datetime import datetime, timedelta
import os
import sys

def load_and_merge_data():
    """Load and merge all required data"""
    print("Loading and merging ADV filing data...")
    
    # Load Schedule D 7.B(1) files (private fund data)
    fund_patterns = [
        "raw/ADV_Filing_Data_2024*/IA_Schedule_D_7B1_*.csv",
        "raw/ADV_Filing_Data_2025*/IA_Schedule_D_7B1_*.csv",
        "raw/adv_filing_data_2024*/IA_Schedule_D_7B1_*.csv",
        "raw/adv-filing-data-2024*/IA_Schedule_D_7B1_*.csv"
    ]
    
    fund_files = []
    for pattern in fund_patterns:
        fund_files.extend(glob(pattern))
    
    print(f"Found {len(fund_files)} fund data files")
    
    # Load ADV Base A files (adviser info)
    base_patterns = [
        "raw/ADV_Filing_Data_2024*/IA_ADV_Base_A_*.csv",
        "raw/ADV_Filing_Data_2025*/IA_ADV_Base_A_*.csv",
        "raw/adv_filing_data_2024*/IA_ADV_Base_A_*.csv",
        "raw/adv-filing-data-2024*/IA_ADV_Base_A_*.csv"
    ]
    
    base_files = []
    for pattern in base_patterns:
        base_files.extend(glob(pattern))
    
    print(f"Found {len(base_files)} base data files")
    
    # Load all fund data
    fund_dataframes = []
    for file in fund_files:
        try:
            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                try:
                    df = pd.read_csv(file, low_memory=False, encoding=encoding)
                    fund_dataframes.append(df)
                    break
                except UnicodeDecodeError:
                    continue
        except Exception as e:
            print(f"Failed to load {file}: {e}")
    
    # Load all base data
    base_dataframes = []
    for file in base_files:
        try:
            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                try:
                    df = pd.read_csv(file, low_memory=False, encoding=encoding)
                    base_dataframes.append(df)
                    break
                except UnicodeDecodeError:
                    continue
        except Exception as e:
            print(f"Failed to load {file}: {e}")
    
    if not fund_dataframes or not base_dataframes:
        print("Failed to load required data!")
        return None
    
    # Combine all data
    df_funds = pd.concat(fund_dataframes, ignore_index=True)
    df_base = pd.concat(base_dataframes, ignore_index=True)
    
    print(f"Total fund records: {len(df_funds)}")
    print(f"Total base records: {len(df_base)}")
    
    # Merge on FilingID
    df_merged = pd.merge(df_funds, df_base, on='FilingID', how='inner')
    print(f"Merged records: {len(df_merged)}")
    
    return df_merged

def find_st_louis_advisers(df):
    """Find advisers in St. Louis, MO"""
    print("\nFinding St. Louis advisers...")
    
    # Filter for St. Louis, MO using the business address (1F1 fields)
    stl_variations = ['ST. LOUIS', 'ST LOUIS', 'SAINT LOUIS', 'SAINTLOUIS']
    
    # Use 1F1-State (business address state) and 1F1-City (business address city)
    df_stl = df[
        (df['1F1-State'].str.upper() == 'MO') &
        (df['1F1-City'].str.upper().isin(stl_variations))
    ]
    
    print(f"Found {len(df_stl)} fund records for St. Louis advisers")
    return df_stl

def analyze_by_adviser(df_stl):
    """Analyze private placement activity by adviser"""
    print("\nAnalyzing by adviser...")
    
    # Look for adviser name columns that are actually populated
    # Check multiple potential columns
    potential_name_cols = ['1C-Legal', '1C-Business', '1A', 'Signatory', '1J-Name']
    
    for col in potential_name_cols:
        if col in df_stl.columns:
            non_null_count = df_stl[col].notna().sum()
            unique_count = df_stl[col].nunique()
            print(f"{col}: {non_null_count} non-null values, {unique_count} unique")
            if non_null_count > 0:
                print(f"  Sample values: {df_stl[col].dropna().head(3).tolist()}")
    
    # Use the most populated column
    name_col = None
    for col in potential_name_cols:
        if col in df_stl.columns and df_stl[col].notna().sum() > 0:
            # Check if it's not just 'N' or 'Y' values
            unique_vals = df_stl[col].dropna().unique()
            if len(unique_vals) > 2 and not all(v in ['Y', 'N', 'YES', 'NO'] for v in unique_vals):
                name_col = col
                break
    
    if name_col is None:
        print("Could not find a proper adviser name column!")
        return None
    
    print(f"\nUsing {name_col} as adviser identifier")
    
    # Clean the data - remove null names and generic values
    df_clean = df_stl[df_stl[name_col].notna() & (df_stl[name_col] != 'N') & (df_stl[name_col] != 'Y')]
    
    if len(df_clean) == 0:
        print("No valid adviser names found!")
        return None
    
    # Convert Gross Asset Value to numeric
    df_clean['Gross Asset Value'] = pd.to_numeric(df_clean['Gross Asset Value'], errors='coerce').fillna(0)
    
    # Group by adviser and aggregate
    summary = df_clean.groupby(name_col).agg({
        'Fund Name': 'count',  # Number of funds
        'Gross Asset Value': 'sum',  # Total assets
        '1F1-City': 'first',  # City (for verification)
        '1F1-State': 'first'  # State (for verification)
    }).rename(columns={
        'Fund Name': 'num_private_funds',
        'Gross Asset Value': 'total_gross_assets',
        '1F1-City': 'city',
        '1F1-State': 'state'
    }).reset_index()
    
    # Sort by number of funds, then by assets
    summary = summary.sort_values(['num_private_funds', 'total_gross_assets'], ascending=False)
    
    print(f"\nTop 10 St. Louis RIAs by private fund count:")
    print(summary.head(10).to_string(index=False))
    
    return summary

def main():
    """Main execution"""
    print("="*80)
    print("RIA HUNTER: IDENTIFYING TOP ST. LOUIS RIA FOR PRIVATE PLACEMENTS")
    print("="*80)
    
    # Load and merge data
    df = load_and_merge_data()
    if df is None:
        return
    
    # Find St. Louis advisers
    df_stl = find_st_louis_advisers(df)
    if len(df_stl) == 0:
        print("No St. Louis advisers found!")
        return
    
    # Analyze by adviser
    summary = analyze_by_adviser(df_stl)
    if summary is None or len(summary) == 0:
        print("No valid analysis results!")
        return
    
    # Report the top RIA
    top_ria = summary.iloc[0]
    adviser_col = summary.columns[0]
    
    print("\n" + "="*80)
    print("FINAL RESULT: TOP ST. LOUIS RIA FOR PRIVATE PLACEMENTS")
    print("="*80)
    print(f"RIA Name: {top_ria[adviser_col]}")
    print(f"Number of Private Funds: {int(top_ria['num_private_funds'])}")
    print(f"Total Gross Assets Under Management: ${top_ria['total_gross_assets']:,.0f}")
    print(f"Location: {top_ria['city']}, {top_ria['state']}")
    print("="*80)
    
    # Save detailed results
    output_file = "output/st_louis_ria_final_analysis.csv"
    summary.to_csv(output_file, index=False)
    print(f"\nDetailed results saved to: {output_file}")

if __name__ == "__main__":
    main()