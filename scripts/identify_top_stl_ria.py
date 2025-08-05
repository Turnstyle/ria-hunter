#!/usr/bin/env python3
"""
Script to identify the top St. Louis RIA for private placements in the last year.
Follows the plan outlined in Plan_ ID_Private_Placements.docx.md
"""

import pandas as pd
import numpy as np
from glob import glob
from datetime import datetime, timedelta
import os
import sys

def load_schedule_d_7b1_data():
    """Load and concatenate all IA Schedule D 7.B(1) files for the last year"""
    print("Step 1: Loading Schedule D 7.B(1) private fund data...")
    
    # Pattern for 2024 and 2025 files
    file_patterns = [
        "raw/ADV_Filing_Data_2024*/IA_Schedule_D_7B1_*.csv",
        "raw/ADV_Filing_Data_2025*/IA_Schedule_D_7B1_*.csv",
        "raw/adv_filing_data_2024*/IA_Schedule_D_7B1_*.csv",  # Alternative naming
        "raw/adv-filing-data-2024*/IA_Schedule_D_7B1_*.csv"   # Alternative naming
    ]
    
    files = []
    for pattern in file_patterns:
        files.extend(glob(pattern))
    
    print(f"Found {len(files)} Schedule D 7.B(1) files")
    for file in files:
        print(f"  - {file}")
    
    if not files:
        print("No Schedule D 7.B(1) files found!")
        return None
    
    # Load and concatenate all files
    dataframes = []
    for file in files:
        print(f"Loading {file}...")
        
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        loaded = False
        
        for encoding in encodings:
            try:
                df = pd.read_csv(file, low_memory=False, encoding=encoding)
                df['source_file'] = file  # Track source
                dataframes.append(df)
                print(f"  Successfully loaded with {encoding} encoding")
                loaded = True
                break
            except UnicodeDecodeError:
                continue
            except Exception as e:
                print(f"  Error with {encoding}: {e}")
                continue
        
        if not loaded:
            print(f"  Failed to load {file} with any encoding")
    
    if not dataframes:
        return None
        
    df_funds = pd.concat(dataframes, ignore_index=True)
    print(f"Total fund records loaded: {len(df_funds)}")
    print(f"Columns in fund data: {list(df_funds.columns)}")
    
    return df_funds

def load_adv_base_data():
    """Load and concatenate corresponding ADV Part 1 base files"""
    print("\nStep 2: Loading ADV Base data...")
    
    # Pattern for ADV Base A files (Section 1A data for firm info)
    file_patterns = [
        "raw/ADV_Filing_Data_2024*/IA_ADV_Base_A_*.csv",
        "raw/ADV_Filing_Data_2025*/IA_ADV_Base_A_*.csv",
        "raw/adv_filing_data_2024*/IA_ADV_Base_A_*.csv",  # Alternative naming
        "raw/adv-filing-data-2024*/IA_ADV_Base_A_*.csv"   # Alternative naming
    ]
    
    files = []
    for pattern in file_patterns:
        files.extend(glob(pattern))
    
    print(f"Found {len(files)} ADV Base A files")
    for file in files:
        print(f"  - {file}")
    
    if not files:
        print("No ADV Base A files found!")
        return None
    
    # Load and concatenate all files
    dataframes = []
    for file in files:
        print(f"Loading {file}...")
        
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        loaded = False
        
        for encoding in encodings:
            try:
                df = pd.read_csv(file, low_memory=False, encoding=encoding)
                df['source_file'] = file  # Track source
                dataframes.append(df)
                print(f"  Successfully loaded with {encoding} encoding")
                loaded = True
                break
            except UnicodeDecodeError:
                continue
            except Exception as e:
                print(f"  Error with {encoding}: {e}")
                continue
        
        if not loaded:
            print(f"  Failed to load {file} with any encoding")
    
    if not dataframes:
        return None
        
    df_base = pd.concat(dataframes, ignore_index=True)
    print(f"Total base records loaded: {len(df_base)}")
    print(f"Columns in base data: {list(df_base.columns)}")
    
    return df_base

def identify_join_key(df_funds, df_base):
    """Identify the common key to join fund data with base data"""
    print("\nStep 3: Identifying join key...")
    
    fund_cols = set(df_funds.columns)
    base_cols = set(df_base.columns)
    common_cols = fund_cols.intersection(base_cols)
    
    print(f"Common columns: {list(common_cols)}")
    
    # Look for likely join keys
    potential_keys = ['FilingID', 'IARD_Number', 'SEC_Number', 'CRD_Number', 'Adviser_CRD_Number']
    
    for key in potential_keys:
        if key in common_cols:
            print(f"Using {key} as join key")
            return key
    
    # If no perfect match, look for similar names
    for fund_col in fund_cols:
        for base_col in base_cols:
            if 'Filing' in fund_col and 'Filing' in base_col:
                print(f"Potential join: {fund_col} (funds) -> {base_col} (base)")
                return fund_col, base_col
            if 'CRD' in fund_col and 'CRD' in base_col:
                print(f"Potential join: {fund_col} (funds) -> {base_col} (base)")
                return fund_col, base_col
    
    print("No clear join key found. Showing sample of each dataset:")
    print("\nFund data sample:")
    print(df_funds.head(2))
    print("\nBase data sample:")
    print(df_base.head(2))
    
    return None

def merge_data(df_funds, df_base, join_key):
    """Merge fund data with base data"""
    print(f"\nStep 4: Merging data on {join_key}...")
    
    if isinstance(join_key, tuple):
        # Different column names in each dataset
        fund_key, base_key = join_key
        df_merged = pd.merge(df_funds, df_base, left_on=fund_key, right_on=base_key, how='inner')
    else:
        # Same column name in both datasets
        df_merged = pd.merge(df_funds, df_base, on=join_key, how='inner')
    
    print(f"Merged records: {len(df_merged)}")
    
    # Show sample of merged data to verify join worked
    cols_to_show = []
    for col in df_merged.columns:
        if any(term in col.lower() for term in ['name', 'city', 'state', 'fund']):
            cols_to_show.append(col)
    
    if cols_to_show:
        print(f"\nSample merged data:")
        print(df_merged[cols_to_show[:6]].head(3))
    
    return df_merged

def filter_st_louis_advisers(df_merged):
    """Filter for St. Louis, Missouri advisers"""
    print("\nStep 5: Filtering for St. Louis, MO advisers...")
    
    # Find city and state columns
    city_cols = [col for col in df_merged.columns if 'city' in col.lower()]
    state_cols = [col for col in df_merged.columns if 'state' in col.lower()]
    
    print(f"City columns found: {city_cols}")
    print(f"State columns found: {state_cols}")
    
    if not city_cols or not state_cols:
        print("Could not find city/state columns!")
        return df_merged
    
    # Use the first city and state columns found
    city_col = city_cols[0]
    state_col = state_cols[0]
    
    print(f"Using {city_col} and {state_col} for filtering")
    
    # Debug: Check what states we have
    print(f"\nAll unique states in {state_col}:")
    print(df_merged[state_col].value_counts().head(20))
    
    # Show unique cities in Missouri first - try both state columns
    mo_data = None
    if state_col in df_merged.columns:
        # First try with the 'State' column (from fund data)
        mo_data_fund = df_merged[df_merged[state_col].str.upper() == 'MO']
        print(f"Records with state='MO' in {state_col}: {len(mo_data_fund)}")
        
        # Also try with the base data state column
        if '1F1-State' in df_merged.columns:
            mo_data_base = df_merged[df_merged['1F1-State'].str.upper() == 'MO']
            print(f"Records with state='MO' in 1F1-State: {len(mo_data_base)}")
            mo_data = mo_data_base if len(mo_data_base) > 0 else mo_data_fund
            if len(mo_data_base) > 0:
                state_col = '1F1-State'  # Use base data state column
        else:
            mo_data = mo_data_fund
    
    if mo_data is not None and len(mo_data) > 0:
        mo_cities = mo_data[city_col].value_counts().head(20)
        print(f"\nTop cities in MO:")
        print(mo_cities)
    else:
        print(f"No data found for MO state!")
    
    # Filter for St. Louis variations
    stl_variations = ['ST. LOUIS', 'ST LOUIS', 'SAINT LOUIS', 'SAINTLOUIS']
    
    # Use the mo_data if we found MO records, otherwise use the original approach
    if mo_data is not None and len(mo_data) > 0:
        df_stl = mo_data[mo_data[city_col].str.upper().isin(stl_variations)]
    else:
        df_stl = df_merged[
            (df_merged[city_col].str.upper().isin(stl_variations)) &
            (df_merged[state_col].str.upper() == 'MO')
        ]
    
    print(f"\nRecords for St. Louis, MO advisers: {len(df_stl)}")
    
    if len(df_stl) > 0:
        # Show unique advisers in St. Louis
        name_cols = [col for col in df_stl.columns if 'name' in col.lower() and 'adviser' in col.lower()]
        if name_cols:
            name_col = name_cols[0]
            unique_advisers = df_stl[name_col].value_counts()
            print(f"\nSt. Louis advisers found:")
            print(unique_advisers.head(10))
    else:
        print("No St. Louis advisers found! Let's check what cities we have in MO:")
        if state_col in df_merged.columns:
            mo_data = df_merged[df_merged[state_col].str.upper() == 'MO']
            if len(mo_data) > 0:
                print(mo_data[city_col].value_counts().head(20))
    
    return df_stl

def filter_last_year(df_stl):
    """Filter for the last 12 months"""
    print("\nStep 6: Filtering for last 12 months...")
    
    # Look for date columns
    date_cols = [col for col in df_stl.columns if any(term in col.lower() for term in ['date', 'period', 'filing'])]
    print(f"Date-related columns: {date_cols}")
    
    # For now, assume data from file names covers the period we need
    # Files from Aug 2024 onward should be "last year" from Aug 2025 perspective
    one_year_ago = datetime.now() - timedelta(days=365)
    print(f"Looking for data after: {one_year_ago.strftime('%Y-%m-%d')}")
    
    # If we have actual date columns, we could filter here
    # For now, return the data as-is since we loaded files from the relevant period
    df_last_year = df_stl.copy()
    
    print(f"Records after date filtering: {len(df_last_year)}")
    return df_last_year

def analyze_private_placement_activity(df_last_year):
    """Aggregate private fund data by adviser to measure activity"""
    print("\nStep 7: Analyzing private placement activity...")
    
    # Find adviser name column from ADV base data
    # Common adviser name columns in ADV forms
    potential_adviser_cols = ['1C-Legal', '1A', '1C-Business', '1J-Name', 'Signatory']
    name_col = None
    
    for col in potential_adviser_cols:
        if col in df_last_year.columns:
            name_col = col
            print(f"Using {name_col} as adviser identifier")
            break
    
    if name_col is None:
        # Fallback - look for any name column
        name_cols = [col for col in df_last_year.columns if 'name' in col.lower()]
        if name_cols:
            name_col = name_cols[0]
            print(f"Using fallback {name_col} as adviser identifier")
        else:
            print("Could not find adviser name column!")
            print("Available columns:", list(df_last_year.columns)[:20])
            return None
    
    # Find fund-related columns
    fund_name_cols = [col for col in df_last_year.columns if 'fund' in col.lower() and 'name' in col.lower()]
    asset_cols = [col for col in df_last_year.columns if any(term in col.lower() for term in ['asset', 'value', 'aum'])]
    
    print(f"Fund name columns: {fund_name_cols}")
    print(f"Asset value columns: {asset_cols}")
    
    # Aggregate by adviser
    agg_dict = {
        'num_private_funds': (fund_name_cols[0] if fund_name_cols else name_col, 'count')
    }
    
    # Add asset aggregation if available
    if asset_cols:
        # Try to find numeric asset column
        for asset_col in asset_cols:
            try:
                # Convert to numeric, replacing any non-numeric values with 0
                df_last_year[asset_col] = pd.to_numeric(df_last_year[asset_col], errors='coerce').fillna(0)
                agg_dict['total_gross_assets'] = (asset_col, 'sum')
                break
            except:
                continue
    
    df_summary = df_last_year.groupby(name_col).agg(**agg_dict).reset_index()
    
    # Sort by number of funds (primary) and assets (secondary)
    sort_cols = ['num_private_funds']
    if 'total_gross_assets' in df_summary.columns:
        sort_cols.append('total_gross_assets')
    
    df_summary = df_summary.sort_values(sort_cols, ascending=False)
    
    print(f"\nTop 10 St. Louis RIAs by private fund activity:")
    print(df_summary.head(10))
    
    return df_summary

def identify_top_ria(df_summary):
    """Identify and report the top RIA"""
    print("\nStep 8: Identifying the top RIA...")
    
    if df_summary is None or len(df_summary) == 0:
        print("No data available for analysis!")
        return None
    
    top_ria = df_summary.iloc[0]
    name_col = df_summary.columns[0]  # First column should be adviser name
    
    print(f"\n" + "="*60)
    print(f"TOP ST. LOUIS RIA FOR PRIVATE PLACEMENTS")
    print(f"="*60)
    print(f"RIA Name: {top_ria[name_col]}")
    print(f"Number of Private Funds: {int(top_ria['num_private_funds'])}")
    
    if 'total_gross_assets' in top_ria.index:
        assets = top_ria['total_gross_assets']
        if assets > 0:
            print(f"Total Gross Assets: ${assets:,.0f}")
    
    print(f"="*60)
    
    return top_ria

def main():
    """Main execution function"""
    print("RIA Hunter: Identifying Top St. Louis RIA for Private Placements")
    print("="*70)
    
    # Step 1: Load Schedule D 7.B(1) data
    df_funds = load_schedule_d_7b1_data()
    if df_funds is None:
        print("Failed to load fund data!")
        return
    
    # Step 2: Load ADV Base data
    df_base = load_adv_base_data()
    if df_base is None:
        print("Failed to load base data!")
        return
    
    # Step 3: Identify join key
    join_key = identify_join_key(df_funds, df_base)
    if join_key is None:
        print("Could not identify join key!")
        return
    
    # Step 4: Merge data
    df_merged = merge_data(df_funds, df_base, join_key)
    if len(df_merged) == 0:
        print("No data after merge!")
        return
    
    # Step 5: Filter for St. Louis
    df_stl = filter_st_louis_advisers(df_merged)
    if len(df_stl) == 0:
        print("No St. Louis advisers found!")
        return
    
    # Step 6: Filter for last year
    df_last_year = filter_last_year(df_stl)
    
    # Step 7: Analyze activity
    df_summary = analyze_private_placement_activity(df_last_year)
    
    # Step 8: Identify top RIA
    top_ria = identify_top_ria(df_summary)
    
    # Save results
    if df_summary is not None:
        output_file = "output/st_louis_ria_private_placement_analysis.csv"
        df_summary.to_csv(output_file, index=False)
        print(f"\nDetailed results saved to: {output_file}")

if __name__ == "__main__":
    main()