#!/usr/bin/env python3
"""
Load RIA profiles CSV into Supabase
Handles data transformation and bulk insert
"""

import pandas as pd
import os
from supabase import create_client, Client
from datetime import datetime
import numpy as np

def main():
    # Load environment variables
    url = os.getenv("SUPABASE_URL", "https://llusjnpltqxhokycwzry.supabase.co")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not service_key:
        print("Error: SUPABASE_SERVICE_ROLE_KEY not found in environment")
        return
    
    # Create Supabase client
    supabase: Client = create_client(url, service_key)
    
    # Load CSV
    print("Loading ria_profiles.csv...")
    df = pd.read_csv("seed/ria_profiles.csv")
    print(f"Loaded {len(df)} rows")
    
    # Transform data to match our schema
    print("Transforming data...")
    
    # Since most CRD numbers are 'N', we'll generate synthetic ones based on row index
    # This matches the approach used in the original ETL process
    
    # Map columns to our schema
    records = []
    for idx, row in df.iterrows():
        # Use row index + 1 as synthetic CRD number (starting from 1)
        synthetic_crd = idx + 1
        
        record = {
            'crd_number': synthetic_crd,
            'legal_name': row['firm_name'] if pd.notna(row['firm_name']) else None,
            'city': row['city'] if pd.notna(row['city']) else None,
            'state': row['state'] if pd.notna(row['state']) else None,
            'aum': float(row['aum']) if pd.notna(row['aum']) and str(row['aum']).replace('.','').replace('-','').isdigit() else None,
            'form_adv_date': datetime.now().date().isoformat()  # Using current date as placeholder
        }
        records.append(record)
    
    print(f"Prepared {len(records)} valid records for insertion")
    
    # Insert in batches
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            result = supabase.table('ria_profiles').insert(batch).execute()
            total_inserted += len(batch)
            print(f"Inserted batch {i//batch_size + 1}: {len(batch)} records (Total: {total_inserted})")
        except Exception as e:
            print(f"Error inserting batch {i//batch_size + 1}: {e}")
            # Continue with next batch
    
    print(f"Completed! Total records inserted: {total_inserted}")

if __name__ == "__main__":
    main()