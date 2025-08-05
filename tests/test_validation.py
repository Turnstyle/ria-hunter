#!/usr/bin/env python3
"""
Validation tests for SEC ETL output.
"""

import pytest
import pandas as pd
import json
from pathlib import Path

def test_ria_profiles_exists():
    """Test that ria_profiles.csv was created."""
    assert Path("output/ria_profiles.csv").exists()

def test_narratives_exists():
    """Test that narratives.json was created."""
    assert Path("output/narratives.json").exists()

def test_ria_profiles_structure():
    """Test that ria_profiles.csv has expected columns."""
    df = pd.read_csv("output/ria_profiles.csv")
    
    # Check required columns
    required_columns = ['firm_name', 'crd_number', 'data_source', 'last_updated']
    for col in required_columns:
        assert col in df.columns, f"Missing required column: {col}"
    
    # Check data types
    assert df['crd_number'].dtype in ['int64', 'float64', 'object']
    
def test_ria_profiles_data_quality():
    """Test data quality in ria_profiles.csv."""
    df = pd.read_csv("output/ria_profiles.csv")
    
    # Should have significant number of records
    assert len(df) > 10000, f"Expected > 10000 records, got {len(df)}"
    
    # CRD numbers should be mostly populated
    crd_populated = df['crd_number'].notna().sum()
    assert crd_populated > len(df) * 0.9, f"Too many missing CRD numbers: {len(df) - crd_populated}"
    
    # Firm names should be populated
    firm_populated = df['firm_name'].notna().sum()
    assert firm_populated > len(df) * 0.95, f"Too many missing firm names: {len(df) - firm_populated}"

def test_narratives_structure():
    """Test that narratives.json has expected structure."""
    with open("output/narratives.json", 'r') as f:
        narratives = json.load(f)
    
    assert isinstance(narratives, list), "Narratives should be a list"
    assert len(narratives) > 0, "Narratives list should not be empty"
    
    # Check first narrative structure
    if narratives:
        first = narratives[0]
        assert 'crd_number' in first, "Narrative missing crd_number"
        assert 'narrative' in first, "Narrative missing narrative text"
        assert 'source' in first, "Narrative missing source"

def test_narratives_content():
    """Test narrative content quality."""
    with open("output/narratives.json", 'r') as f:
        narratives = json.load(f)
    
    # Check that narratives have reasonable length
    narrative_lengths = [len(n['narrative']) for n in narratives if 'narrative' in n]
    avg_length = sum(narrative_lengths) / len(narrative_lengths)
    
    assert avg_length > 50, f"Narratives too short: avg {avg_length} chars"
    assert max(narrative_lengths) > 100, "No substantial narratives found"

def test_aum_values():
    """Test AUM values are reasonable."""
    df = pd.read_csv("output/ria_profiles.csv")
    
    if 'aum' in df.columns:
        # Check for reasonable AUM values
        aum_positive = df[df['aum'] > 0]
        assert len(aum_positive) > 0, "No positive AUM values found"
        
        # Check range is reasonable (between $1K and $10T)
        max_aum = df['aum'].max()
        assert max_aum < 10_000_000_000_000, f"Unreasonably high AUM: ${max_aum:,.0f}"

def test_geographic_coverage():
    """Test geographic data coverage."""
    df = pd.read_csv("output/ria_profiles.csv")
    
    if 'state' in df.columns:
        states = df['state'].dropna().unique()
        assert len(states) > 10, f"Too few states represented: {len(states)}"

def test_data_consistency():
    """Test consistency between profiles and narratives."""
    df = pd.read_csv("output/ria_profiles.csv")
    with open("output/narratives.json", 'r') as f:
        narratives = json.load(f)
    
    # Extract CRD numbers from both
    profile_crds = set(df['crd_number'].dropna().astype(str))
    narrative_crds = set(n['crd_number'] for n in narratives if 'crd_number' in n)
    
    # All narrative CRDs should be in profiles
    missing_crds = narrative_crds - profile_crds
    assert len(missing_crds) == 0, f"CRDs in narratives but not profiles: {missing_crds}"

if __name__ == "__main__":
    # Run basic validation
    print("Running validation tests...")
    
    # Basic checks
    try:
        test_ria_profiles_exists()
        print("✓ ria_profiles.csv exists")
    except AssertionError as e:
        print(f"✗ {e}")
    
    try:
        test_narratives_exists()
        print("✓ narratives.json exists")
    except AssertionError as e:
        print(f"✗ {e}")
    
    # Data quality checks
    try:
        df = pd.read_csv("output/ria_profiles.csv")
        print(f"✓ Loaded {len(df):,} RIA profiles")
        print(f"  - CRD numbers: {df['crd_number'].notna().sum():,}")
        print(f"  - With AUM data: {(df['aum'] > 0).sum():,}" if 'aum' in df.columns else "  - No AUM data")
        
        with open("output/narratives.json", 'r') as f:
            narratives = json.load(f)
        print(f"✓ Loaded {len(narratives):,} narratives")
        
    except Exception as e:
        print(f"✗ Error loading data: {e}")