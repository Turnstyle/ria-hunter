#!/usr/bin/env python3
"""Direct loader for RIA profiles with real CRDs"""
import os
import sys
from pathlib import Path
from supabase import create_client, Client

# Load environment
from dotenv import load_dotenv
load_dotenv('.env.local')

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').strip()
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()

if not url or not key:
    print("Missing Supabase credentials")
    sys.exit(1)

# Create client
supabase: Client = create_client(url, key)

# Load real RIA data from raw SEC files
import glob

# Find ALL ADV filing data directories
raw_dirs = sorted(glob.glob('raw/ADV_Filing_Data_*') + glob.glob('raw/adv_filing_data_*'))
if not raw_dirs:
    print("No raw ADV data found")
    sys.exit(1)

print(f"Found {len(raw_dirs)} data directories")

import pandas as pd

# Load and combine all data files
all_data = []
for raw_dir in raw_dirs:
    base_files = glob.glob(f"{raw_dir}/ERA_ADV_Base_*.csv")
    if base_files:
        try:
            df = pd.read_csv(base_files[0], low_memory=False, encoding='latin-1')
            # Column mapping - CRD is in '1E1' column
            df['CRD'] = pd.to_numeric(df['1E1'], errors='coerce')
            df['Legal_Name'] = df['1A']
            df['City'] = df.get('1F2_City', df.get('1F2-City', ''))
            df['State'] = df.get('1F2_State', df.get('1F2-State', ''))
            # Add only valid CRDs
            df_valid = df[df['CRD'].notna() & (df['CRD'] > 0)]
            all_data.append(df_valid)
            print(f"Loaded {len(df_valid)} valid records from {Path(base_files[0]).name}")
        except Exception as e:
            print(f"Error loading {base_files[0]}: {e}")

# Combine all data
if all_data:
    df_valid = pd.concat(all_data, ignore_index=True)
    # Remove duplicates, keeping the most recent
    df_valid = df_valid.drop_duplicates(subset=['CRD'], keep='last')
    print(f"\nTotal unique records with valid CRD numbers: {len(df_valid)}")
else:
    print("No valid data loaded")
    sys.exit(1)

# Check for specific CRDs
test_crds = [4540, 37890, 68, 74]
for crd in test_crds:
    exists = len(df_valid[df_valid['CRD'] == crd]) > 0
    print(f"CRD {crd}: {'FOUND' if exists else 'NOT FOUND'}")

# Prepare data for insertion
profiles = []
for _, row in df_valid.iterrows():
    profile = {
        'crd_number': int(row['CRD']),
        'legal_name': str(row.get('Legal_Name', '')).strip()[:255] if pd.notna(row.get('Legal_Name')) else None,
        'city': str(row.get('City', '')).strip()[:100] if pd.notna(row.get('City')) else None,
        'state': str(row.get('State', '')).strip()[:2] if pd.notna(row.get('State')) else None,
        'aum': int(row.get('AUM', 0)) if pd.notna(row.get('AUM')) else None,
        'form_adv_date': str(row.get('Filing_Date', ''))[:10] if pd.notna(row.get('Filing_Date')) else None,
    }
    
    # Skip if no legal name
    if profile['legal_name']:
        profiles.append(profile)

print(f"Prepared {len(profiles)} profiles for insertion")

# Insert in batches
batch_size = 500
for i in range(0, len(profiles), batch_size):
    batch = profiles[i:i+batch_size]
    try:
        result = supabase.table('ria_profiles').upsert(
            batch,
            on_conflict='crd_number'
        ).execute()
        print(f"Inserted batch {i//batch_size + 1}: {len(batch)} records")
    except Exception as e:
        print(f"Error in batch {i//batch_size + 1}: {e}")
        # Try individual inserts for this batch
        for profile in batch:
            try:
                supabase.table('ria_profiles').upsert(
                    profile,
                    on_conflict='crd_number'
                ).execute()
            except Exception as e2:
                print(f"Failed to insert CRD {profile['crd_number']}: {e2}")

# Verify specific CRDs
print("\nVerifying test CRDs in database:")
for crd in test_crds:
    try:
        result = supabase.table('ria_profiles').select('crd_number,legal_name').eq('crd_number', crd).execute()
        if result.data:
            print(f"CRD {crd}: {result.data[0]['legal_name']}")
        else:
            print(f"CRD {crd}: NOT IN DATABASE")
    except Exception as e:
        print(f"CRD {crd}: ERROR - {e}")

print("\nDone!")
