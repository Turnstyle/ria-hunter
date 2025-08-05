#!/usr/bin/env python3
"""
Enhanced script to populate ALL private placement data in Supabase from the complete ADV dataset.
This script processes the full combined ADV data to find ALL RIAs with private fund activity.
"""

import pandas as pd
import os
from supabase import create_client, Client
from datetime import datetime
import json
import numpy as np

def get_supabase_client():
    """Create Supabase client"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("Error: Missing Supabase credentials")
        print("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        return None
    
    return create_client(url, key)

def load_combined_adv_data():
    """Load the complete combined ADV dataset"""
    try:
        print("Loading combined ADV dataset...")
        df = pd.read_csv('output/intermediate/adv_base_combined.csv', low_memory=False)
        print(f"Loaded {len(df)} total ADV records")
        return df
    except FileNotFoundError:
        print("Error: Combined ADV dataset not found at output/intermediate/adv_base_combined.csv")
        return None

def extract_private_fund_data(df):
    """Extract RIAs with private fund activity from the ADV data"""
    print("\nExtracting private fund data from ADV forms...")
    
    # Filter for RIAs that have private fund activity (7B = Y indicates Schedule D section 7.B private funds)
    private_fund_rias = df[df['7B'] == 'Y'].copy()
    
    print(f"Found {len(private_fund_rias)} RIAs with private fund activity (7B=Y)")
    
    if len(private_fund_rias) == 0:
        print("No RIAs found with private fund activity!")
        return None
    
    # Create summary by RIA (in case of multiple filings)
    grouped = private_fund_rias.groupby('1A').agg({
        '1F1-City': 'first',
        '1F1-State': 'first', 
        '1F1-Postal': 'first',
        '1E1': 'first',  # CRD number
        '5F2a': 'first',  # Total AUM
        '7B': 'count',   # Count of filings with private funds
        'DateSubmitted': 'max'  # Most recent filing
    }).reset_index()
    
    # Rename columns for clarity
    grouped.columns = ['firm_name', 'city', 'state', 'zip_code', 'crd_number', 'total_aum', 'private_fund_filings', 'latest_filing']
    
    # Clean and standardize data
    grouped['city'] = grouped['city'].str.upper()
    grouped['state'] = grouped['state'].str.upper()
    grouped['crd_number'] = pd.to_numeric(grouped['crd_number'], errors='coerce')
    grouped['total_aum'] = pd.to_numeric(grouped['total_aum'], errors='coerce')
    
    # Remove records without CRD numbers
    grouped = grouped.dropna(subset=['crd_number'])
    grouped['crd_number'] = grouped['crd_number'].astype(int)
    
    print(f"Processed to {len(grouped)} unique RIAs with private fund activity")
    
    # Show top 10 by AUM
    top_firms = grouped.nlargest(10, 'total_aum')[['firm_name', 'city', 'state', 'total_aum', 'private_fund_filings']]
    print(f"\nTop 10 RIAs by AUM with private fund activity:")
    for _, row in top_firms.iterrows():
        print(f"  {row['firm_name'][:50]} ({row['city']}, {row['state']}) - ${row['total_aum']:,.0f} AUM, {row['private_fund_filings']} filings")
    
    return grouped

def fetch_existing_rias(supabase: Client):
    """Fetch existing RIA profiles from database"""
    try:
        response = supabase.table('ria_profiles').select('*').execute()
        df = pd.DataFrame(response.data)
        print(f"Fetched {len(df)} existing RIA profiles from database")
        return df
    except Exception as e:
        print(f"Error fetching RIA profiles: {e}")
        return None

def match_firms_to_existing(private_fund_df, existing_df):
    """Match private fund RIAs to existing database records"""
    matches = []
    
    print(f"\nMatching {len(private_fund_df)} private fund RIAs to existing database records...")
    
    # Convert CRD numbers to strings for matching
    existing_df['crd_number'] = existing_df['crd_number'].astype(str)
    private_fund_df['crd_number'] = private_fund_df['crd_number'].astype(str)
    
    for _, pf_row in private_fund_df.iterrows():
        crd_num = str(pf_row['crd_number'])
        firm_name = pf_row['firm_name']
        
        # Try exact CRD match first
        exact_match = existing_df[existing_df['crd_number'] == crd_num]
        
        if len(exact_match) > 0:
            match = exact_match.iloc[0]
            matches.append({
                'crd_number': crd_num,
                'legal_name': match['legal_name'],
                'private_fund_firm_name': firm_name,
                'private_fund_count': int(pf_row['private_fund_filings']),
                'private_fund_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0,
                'city': pf_row['city'],
                'state': pf_row['state'],
                'match_type': 'crd_exact',
                'total_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0
            })
            continue
        
        # Try name matching if no CRD match
        name_matches = existing_df[existing_df['legal_name'].str.upper().str.contains(firm_name.upper().split()[0], na=False)]
        
        if len(name_matches) > 0:
            match = name_matches.iloc[0]
            matches.append({
                'crd_number': match['crd_number'],
                'legal_name': match['legal_name'],
                'private_fund_firm_name': firm_name,
                'private_fund_count': int(pf_row['private_fund_filings']),
                'private_fund_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0,
                'city': pf_row['city'],
                'state': pf_row['state'],
                'match_type': 'name_partial',
                'total_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0
            })
            print(f"~ Name match: {firm_name[:30]} -> {match['legal_name'][:30]} (CRD {match['crd_number']})")
            continue
        
        # No match found
        print(f"✗ No match found for: {firm_name} (CRD {crd_num})")
        matches.append({
            'crd_number': crd_num,
            'legal_name': None,
            'private_fund_firm_name': firm_name,
            'private_fund_count': int(pf_row['private_fund_filings']),
            'private_fund_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0,
            'city': pf_row['city'],
            'state': pf_row['state'],
            'match_type': 'none',
            'total_aum': float(pf_row['total_aum']) if pd.notna(pf_row['total_aum']) else 0
        })
    
    return pd.DataFrame(matches)

def update_database(supabase: Client, matches_df):
    """Update database with private placement data"""
    print(f"\nUpdating database with private placement data...")
    
    successful_updates = 0
    failed_updates = 0
    
    # Only update records that have matches
    matched_records = matches_df[matches_df['match_type'] != 'none']
    
    print(f"Updating {len(matched_records)} matched records...")
    
    for _, match in matched_records.iterrows():        
        try:
            # Update the ria_profiles table
            update_data = {
                'private_fund_count': int(match['private_fund_count']),
                'private_fund_aum': float(match['private_fund_aum']),
                'last_private_fund_analysis': datetime.now().isoformat()
            }
            
            response = supabase.table('ria_profiles').update(update_data).eq('crd_number', match['crd_number']).execute()
            
            if response.data:
                if successful_updates < 10:  # Only show first 10 to avoid spam
                    print(f"✓ Updated CRD {match['crd_number']}: {match['private_fund_count']} funds, ${match['private_fund_aum']:,.0f} AUM")
                successful_updates += 1
                
                if successful_updates % 100 == 0:
                    print(f"  ... Updated {successful_updates} records so far")
            else:
                print(f"✗ Failed to update CRD {match['crd_number']}")
                failed_updates += 1
                
        except Exception as e:
            print(f"✗ Error updating CRD {match['crd_number']}: {e}")
            failed_updates += 1
    
    print(f"\nUpdate Summary:")
    print(f"Successful updates: {successful_updates}")
    print(f"Failed updates: {failed_updates}")
    
    return successful_updates, failed_updates

def save_comprehensive_report(private_fund_df, matches_df):
    """Save comprehensive reports of the processing"""
    
    # Save private fund analysis
    private_fund_df.to_csv('output/all_private_fund_rias_analysis.csv', index=False)
    print(f"\nPrivate fund analysis saved to: output/all_private_fund_rias_analysis.csv")
    
    # Save matching report
    matches_df.to_csv('output/all_private_placement_matching_report.csv', index=False)
    print(f"Matching report saved to: output/all_private_placement_matching_report.csv")
    
    # Print comprehensive summary
    print(f"\n" + "="*80)
    print(f"COMPREHENSIVE PRIVATE PLACEMENT ANALYSIS SUMMARY")
    print(f"="*80)
    print(f"Total RIAs with private fund activity: {len(private_fund_df)}")
    print(f"CRD exact matches: {len(matches_df[matches_df['match_type'] == 'crd_exact'])}")
    print(f"Name partial matches: {len(matches_df[matches_df['match_type'] == 'name_partial'])}")
    print(f"No matches: {len(matches_df[matches_df['match_type'] == 'none'])}")
    
    # Top states by private fund activity
    if len(matches_df) > 0:
        state_summary = matches_df.groupby('state').agg({
            'private_fund_count': 'sum',
            'private_fund_aum': 'sum',
            'crd_number': 'count'
        }).sort_values('private_fund_aum', ascending=False).head(10)
        
        print(f"\nTop 10 States by Private Fund AUM:")
        for state, data in state_summary.iterrows():
            print(f"  {state}: {data['crd_number']} RIAs, ${data['private_fund_aum']:,.0f} total AUM")

def main():
    """Main execution function"""
    print("="*80)
    print("POPULATING ALL PRIVATE PLACEMENT DATA IN SUPABASE")
    print("="*80)
    
    # Load combined ADV data
    adv_df = load_combined_adv_data()
    if adv_df is None:
        return
    
    # Extract private fund data
    private_fund_df = extract_private_fund_data(adv_df)
    if private_fund_df is None:
        return
    
    # Create Supabase client
    supabase = get_supabase_client()
    if supabase is None:
        return
    
    # Fetch existing RIA data
    existing_df = fetch_existing_rias(supabase)
    if existing_df is None:
        return
    
    # Match firms to existing database records
    matches_df = match_firms_to_existing(private_fund_df, existing_df)
    
    # Save comprehensive reports
    save_comprehensive_report(private_fund_df, matches_df)
    
    # Ask for confirmation before updating database
    matched_count = len(matches_df[matches_df['match_type'] != 'none'])
    print(f"\nReady to update {matched_count} RIA records with private placement data.")
    print(f"This will update ALL RIAs with private fund activity, not just St. Louis.")
    
    confirm = input("Proceed with database update? (y/N): ").lower().strip()
    if confirm != 'y':
        print("Update cancelled. Reports have been saved for review.")
        return
    
    # Update database
    successful, failed = update_database(supabase, matches_df)
    
    print(f"\n" + "="*80)
    print(f"DATABASE UPDATE COMPLETE")
    print(f"Successfully updated {successful} RIA records with private placement data")
    if failed > 0:
        print(f"Failed to update {failed} records")
    print("="*80)

if __name__ == "__main__":
    main()