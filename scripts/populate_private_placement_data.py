#!/usr/bin/env python3
"""
Script to populate private placement data in Supabase from our analysis results.
This script matches our St. Louis RIA analysis to existing CRD numbers and updates the database.
"""

import pandas as pd
import os
from supabase import create_client, Client
from datetime import datetime
import json

def get_supabase_client():
    """Create Supabase client"""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("Error: Missing Supabase credentials")
        print("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
        return None
    
    return create_client(url, key)

def load_analysis_results():
    """Load our St. Louis RIA analysis results"""
    try:
        df = pd.read_csv('output/st_louis_ria_final_analysis.csv')
        print(f"Loaded {len(df)} RIAs from analysis")
        return df
    except FileNotFoundError:
        print("Error: Analysis results file not found")
        print("Run the analysis script first: python3 scripts/identify_top_stl_ria_final.py")
        return None

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

def match_firms_to_crd(analysis_df, existing_df):
    """Match our analysis firms to existing CRD numbers"""
    matches = []
    
    print("\nMatching analysis results to existing database records...")
    
    for _, analysis_row in analysis_df.iterrows():
        firm_name = analysis_row['1A']
        
        # Try exact match first
        exact_match = existing_df[existing_df['legal_name'].str.upper() == firm_name.upper()]
        
        if len(exact_match) > 0:
            match = exact_match.iloc[0]
            matches.append({
                'crd_number': match['crd_number'],
                'legal_name': match['legal_name'],
                'analysis_name': firm_name,
                'private_fund_count': int(analysis_row['num_private_funds']),
                'private_fund_aum': float(analysis_row['total_gross_assets']),
                'city': analysis_row['city'],
                'state': analysis_row['state'],
                'match_type': 'exact'
            })
            print(f"✓ Exact match: {firm_name} -> CRD {match['crd_number']}")
            continue
        
        # Try partial match (contains)
        partial_matches = existing_df[existing_df['legal_name'].str.upper().str.contains(firm_name.upper().split()[0], na=False)]
        
        if len(partial_matches) > 0:
            match = partial_matches.iloc[0]
            matches.append({
                'crd_number': match['crd_number'],
                'legal_name': match['legal_name'],
                'analysis_name': firm_name,
                'private_fund_count': int(analysis_row['num_private_funds']),
                'private_fund_aum': float(analysis_row['total_gross_assets']),
                'city': analysis_row['city'],
                'state': analysis_row['state'],
                'match_type': 'partial'
            })
            print(f"~ Partial match: {firm_name} -> {match['legal_name']} (CRD {match['crd_number']})")
            continue
        
        # No match found
        print(f"✗ No match found for: {firm_name}")
        matches.append({
            'crd_number': None,
            'legal_name': None,
            'analysis_name': firm_name,
            'private_fund_count': int(analysis_row['num_private_funds']),
            'private_fund_aum': float(analysis_row['total_gross_assets']),
            'city': analysis_row['city'],
            'state': analysis_row['state'],
            'match_type': 'none'
        })
    
    return pd.DataFrame(matches)

def update_database(supabase: Client, matches_df):
    """Update database with private placement data"""
    print(f"\nUpdating database with private placement data...")
    
    successful_updates = 0
    failed_updates = 0
    
    for _, match in matches_df.iterrows():
        if match['crd_number'] is None:
            print(f"Skipping {match['analysis_name']} - no CRD match")
            continue
        
        try:
            # Update the ria_profiles table
            update_data = {
                'private_fund_count': match['private_fund_count'],
                'private_fund_aum': match['private_fund_aum'],
                'last_private_fund_analysis': datetime.now().isoformat()
            }
            
            response = supabase.table('ria_profiles').update(update_data).eq('crd_number', match['crd_number']).execute()
            
            if response.data:
                print(f"✓ Updated CRD {match['crd_number']}: {match['private_fund_count']} funds, ${match['private_fund_aum']:,.0f}")
                successful_updates += 1
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

def save_matching_report(matches_df):
    """Save a report of the matching process"""
    output_file = 'output/private_placement_matching_report.csv'
    matches_df.to_csv(output_file, index=False)
    print(f"\nMatching report saved to: {output_file}")
    
    # Print summary
    print(f"\nMatching Summary:")
    print(f"Total firms analyzed: {len(matches_df)}")
    print(f"Exact matches: {len(matches_df[matches_df['match_type'] == 'exact'])}")
    print(f"Partial matches: {len(matches_df[matches_df['match_type'] == 'partial'])}")
    print(f"No matches: {len(matches_df[matches_df['match_type'] == 'none'])}")

def main():
    """Main execution function"""
    print("="*80)
    print("POPULATING PRIVATE PLACEMENT DATA IN SUPABASE")
    print("="*80)
    
    # Load analysis results
    analysis_df = load_analysis_results()
    if analysis_df is None:
        return
    
    # Create Supabase client
    supabase = get_supabase_client()
    if supabase is None:
        return
    
    # Fetch existing RIA data
    existing_df = fetch_existing_rias(supabase)
    if existing_df is None:
        return
    
    # Match firms to CRD numbers
    matches_df = match_firms_to_crd(analysis_df, existing_df)
    
    # Save matching report
    save_matching_report(matches_df)
    
    # Ask for confirmation before updating database
    matched_count = len(matches_df[matches_df['match_type'] != 'none'])
    print(f"\nReady to update {matched_count} RIA records with private placement data.")
    
    confirm = input("Proceed with database update? (y/N): ").lower().strip()
    if confirm != 'y':
        print("Update cancelled.")
        return
    
    # Update database
    successful, failed = update_database(supabase, matches_df)
    
    print(f"\n" + "="*80)
    print(f"DATABASE UPDATE COMPLETE")
    print(f"Successfully updated {successful} RIA records")
    if failed > 0:
        print(f"Failed to update {failed} records")
    print("="*80)

if __name__ == "__main__":
    main()