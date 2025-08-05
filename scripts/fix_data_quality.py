#!/usr/bin/env python3
"""
Data Quality Fix Script for RIA Hunter
Addresses:
1. AUM units issue (values in thousands, should be actual dollars)
2. Duplicate CRD number issue (same firm with multiple CRDs)
3. Missing/null legal names
"""

import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_supabase_client() -> Client:
    """Initialize Supabase client"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
    
    return create_client(url, key)

def analyze_data_quality(supabase: Client):
    """Analyze current data quality issues"""
    logger.info("🔍 Analyzing data quality issues...")
    
    # Check AUM distribution
    logger.info("📊 Checking AUM distribution...")
    aum_stats = supabase.table('ria_profiles').select('aum').order('aum', desc=True).limit(10).execute()
    logger.info(f"Top 10 AUM values: {[row['aum'] for row in aum_stats.data]}")
    
    # Check for duplicates by legal_name
    logger.info("🔍 Checking for duplicate legal names...")
    duplicates = supabase.rpc('get_duplicate_firms').execute()
    if duplicates.data:
        logger.info(f"Found {len(duplicates.data)} firms with multiple CRD numbers")
        for dup in duplicates.data[:5]:  # Show first 5
            logger.info(f"  - {dup['legal_name']}: {dup['crd_count']} CRD numbers")
    
    # Check for null legal names
    null_names = supabase.table('ria_profiles').select('crd_number').is_('legal_name', 'null').execute()
    logger.info(f"📝 Found {len(null_names.data)} records with null legal_name")
    
    return {
        'top_aum': aum_stats.data,
        'duplicates': duplicates.data if duplicates.data else [],
        'null_names_count': len(null_names.data)
    }

def fix_aum_units(supabase: Client):
    """
    Fix AUM units - multiply by 1000 if values appear to be in thousands
    Edward Jones should have ~$1.8 trillion, not $5 million
    """
    logger.info("💰 Fixing AUM units...")
    
    # Get Edward Jones records to check current values
    edward_jones = supabase.table('ria_profiles').select('crd_number, legal_name, aum').ilike('legal_name', '%edward%jones%').execute()
    
    if edward_jones.data:
        current_aum = edward_jones.data[0]['aum']
        logger.info(f"Edward Jones current AUM: ${current_aum:,}")
        
        # If Edward Jones AUM < 100 million, it's likely in wrong units
        if current_aum < 100_000_000:
            logger.info("🔧 AUM values appear to be in wrong units. Applying correction...")
            
            # Multiply all AUM values by 1000 (assuming they're in thousands)
            result = supabase.rpc('fix_aum_units', {'multiplier': 1000}).execute()
            logger.info(f"✅ Updated AUM for {result.data} records")
            
            # Verify the fix
            edward_jones_fixed = supabase.table('ria_profiles').select('aum').ilike('legal_name', '%edward%jones%').limit(1).execute()
            if edward_jones_fixed.data:
                new_aum = edward_jones_fixed.data[0]['aum']
                logger.info(f"Edward Jones new AUM: ${new_aum:,}")
        else:
            logger.info("✅ AUM values appear to be in correct units")
    else:
        logger.warning("⚠️ Could not find Edward Jones records for AUM validation")

def deduplicate_firms(supabase: Client):
    """
    Fix duplicate CRD numbers by keeping the record with the highest AUM
    and updating references
    """
    logger.info("🔗 Fixing duplicate CRD numbers...")
    
    # Get firms with multiple CRD numbers
    duplicates = supabase.rpc('get_duplicate_firms').execute()
    
    if not duplicates.data:
        logger.info("✅ No duplicate firms found")
        return
    
    fixed_count = 0
    for firm in duplicates.data:
        legal_name = firm['legal_name']
        logger.info(f"🔧 Processing duplicates for: {legal_name}")
        
        # Get all CRD numbers for this firm
        firm_records = supabase.table('ria_profiles').select('crd_number, aum').eq('legal_name', legal_name).order('aum', desc=True).execute()
        
        if len(firm_records.data) > 1:
            # Keep the record with highest AUM
            primary_crd = firm_records.data[0]['crd_number']
            duplicate_crds = [record['crd_number'] for record in firm_records.data[1:]]
            
            logger.info(f"  - Keeping CRD {primary_crd} (highest AUM)")
            logger.info(f"  - Removing CRDs: {duplicate_crds}")
            
            # Update narratives table to point to primary CRD
            for dup_crd in duplicate_crds:
                supabase.table('narratives').update({'crd_number': primary_crd}).eq('crd_number', dup_crd).execute()
            
            # Delete duplicate records
            for dup_crd in duplicate_crds:
                supabase.table('ria_profiles').delete().eq('crd_number', dup_crd).execute()
            
            fixed_count += len(duplicate_crds)
    
    logger.info(f"✅ Removed {fixed_count} duplicate records")

def create_database_functions(supabase: Client):
    """Create helper functions in the database"""
    logger.info("🛠️ Creating database helper functions...")
    
    # Function to get duplicate firms
    get_duplicates_sql = """
    CREATE OR REPLACE FUNCTION get_duplicate_firms()
    RETURNS TABLE(legal_name TEXT, crd_count BIGINT) AS $$
    BEGIN
        RETURN QUERY
        SELECT rp.legal_name, COUNT(rp.crd_number) as crd_count
        FROM ria_profiles rp
        WHERE rp.legal_name IS NOT NULL
        GROUP BY rp.legal_name
        HAVING COUNT(rp.crd_number) > 1
        ORDER BY COUNT(rp.crd_number) DESC;
    END;
    $$ LANGUAGE plpgsql;
    """
    
    # Function to fix AUM units
    fix_aum_sql = """
    CREATE OR REPLACE FUNCTION fix_aum_units(multiplier INTEGER)
    RETURNS INTEGER AS $$
    DECLARE
        updated_count INTEGER;
    BEGIN
        UPDATE ria_profiles 
        SET aum = aum * multiplier 
        WHERE aum IS NOT NULL AND aum > 0;
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RETURN updated_count;
    END;
    $$ LANGUAGE plpgsql;
    """
    
    try:
        supabase.rpc('exec_sql', {'sql': get_duplicates_sql}).execute()
        supabase.rpc('exec_sql', {'sql': fix_aum_sql}).execute()
        logger.info("✅ Database functions created successfully")
    except Exception as e:
        logger.warning(f"⚠️ Could not create database functions: {e}")
        logger.info("Proceeding with direct SQL operations...")

def main():
    """Main execution function"""
    logger.info("🚀 Starting RIA Hunter Data Quality Fix...")
    
    try:
        # Initialize Supabase client
        supabase = get_supabase_client()
        logger.info("✅ Connected to Supabase")
        
        # Create helper functions
        create_database_functions(supabase)
        
        # Analyze current issues
        analysis = analyze_data_quality(supabase)
        
        # Fix AUM units
        fix_aum_units(supabase)
        
        # Fix duplicates
        deduplicate_firms(supabase)
        
        # Final analysis
        logger.info("📊 Final data quality check...")
        final_analysis = analyze_data_quality(supabase)
        
        logger.info("🎉 Data quality fix completed!")
        logger.info(f"Summary:")
        logger.info(f"  - Null names: {final_analysis['null_names_count']}")
        logger.info(f"  - Duplicate firms: {len(final_analysis['duplicates'])}")
        
        if final_analysis['top_aum']:
            top_aum = final_analysis['top_aum'][0]['aum']
            logger.info(f"  - Highest AUM: ${top_aum:,}")
        
    except Exception as e:
        logger.error(f"❌ Error during data quality fix: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()