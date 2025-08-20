#!/usr/bin/env python3
"""
Script to load sample data into RIA Hunter database for development.
This creates realistic-looking sample data without requiring access to SEC files.
"""

import os
import sys
import uuid
import json
import random
from datetime import datetime
from rich.console import Console
from supabase import create_client, Client
from dotenv import load_dotenv

console = Console()

# Set Supabase configuration directly
# In a production environment, these would be loaded from environment variables
SUPABASE_URL = 'https://llusjnpltqxhokycwzry.supabase.co'
# You'll need to provide the Supabase service role key when running the script
SUPABASE_SERVICE_KEY = None  # Will be provided via command line

if len(sys.argv) > 1 and sys.argv[1].startswith('eyJ'):
    SUPABASE_SERVICE_KEY = sys.argv[1]
    # Remove the key from sys.argv to not interfere with other arguments
    sys.argv.pop(1)
elif 'SUPABASE_SERVICE_ROLE_KEY' in os.environ:
    SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase service role key. Please provide it as the first argument.[/red]")
    console.print("[yellow]Usage: python load_sample_data.py <SERVICE_KEY> [count][/yellow]")
    sys.exit(1)

# Create Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Sample data
states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]
cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "San Francisco", "Indianapolis", "Seattle", "Denver", "Washington", "Boston", "El Paso", "Nashville", "Oklahoma City", "Las Vegas", "Detroit", "Portland", "Memphis", "Louisville", "Milwaukee", "Albuquerque", "Tucson", "Fresno", "Sacramento", "Kansas City", "Long Beach", "Mesa", "Atlanta", "Colorado Springs", "Raleigh", "Omaha", "Miami", "St. Louis", "Tampa", "Pittsburgh", "Cincinnati", "Honolulu", "Minneapolis", "Bakersfield", "Wichita", "New Orleans"]
firm_name_parts = ["Capital", "Wealth", "Asset", "Investment", "Financial", "Partners", "Management", "Advisors", "Group", "Strategies", "Global", "Equity", "Trust", "Venture", "Private", "Core", "First", "Premier", "Summit", "Strategic", "United", "National", "American", "International", "Horizon", "Legacy", "Pinnacle", "Elite", "Focused", "Progressive", "Secure", "Balanced", "Dynamic", "Precision", "Reliable", "Innovative", "Cornerstone", "Alliance", "Visionary", "Guardian"]
firm_suffixes = ["LLC", "Inc.", "Advisors", "Management", "Partners", "Group", "Advisers", "Services", "Investments", "Capital", "Wealth"]
services = ["Portfolio Management", "Financial Planning", "Retirement Planning", "Tax Planning", "Estate Planning", "Investment Advisory", "Wealth Management", "Asset Allocation", "Risk Management", "Family Office Services", "Business Succession Planning", "Charitable Giving", "Education Planning", "Insurance Analysis", "Cash Flow Management"]
client_types = ["Individuals", "High Net Worth Individuals", "Families", "Trusts", "Corporations", "Charitable Organizations", "Pension Plans", "Profit Sharing Plans", "Endowments", "Foundations", "Government Entities", "Business Owners", "Corporate Executives", "Medical Professionals", "Legal Professionals"]
fund_types = ["Venture Capital", "Private Equity", "Hedge Fund", "Real Estate", "Fixed Income", "Equity", "Balanced", "Money Market", "Commodity", "International", "Emerging Markets", "Growth", "Value", "Income", "Index"]
executive_positions = ["CEO", "President", "Managing Partner", "Chief Investment Officer", "Chief Financial Officer", "Managing Director", "Partner", "Executive Vice President", "Senior Vice President", "Vice President", "Director", "Principal", "Founder", "Co-Founder", "Chairman"]

def generate_name():
    """Generate a firm name from random parts."""
    parts = random.sample(firm_name_parts, k=random.randint(1, 3))
    suffix = random.choice(firm_suffixes)
    return " ".join(parts) + " " + suffix

def generate_sec_number():
    """Generate a random SEC number."""
    return f"SEC-{random.randint(100000, 999999)}"

def generate_ria_profiles(count=50):
    """Generate a list of sample RIA profiles."""
    ria_profiles = []
    
    for _ in range(count):
        name = generate_name()
        sec_number = generate_sec_number()
        city = random.choice(cities)
        state = random.choice(states)
        aum = random.randint(1000000, 50000000000)  # $1M to $50B
        employee_count = random.randint(3, 500)
        
        # Select 2-5 random services
        profile_services = random.sample(services, k=random.randint(2, 5))
        
        # Select 2-4 random client types
        profile_client_types = random.sample(client_types, k=random.randint(2, 4))
        
        ria_profiles.append({
            "name": name,
            "sec_number": sec_number,
            "city": city,
            "state": state,
            "aum": aum,
            "employee_count": employee_count,
            "services": profile_services,
            "client_types": profile_client_types
        })
    
    return ria_profiles

def generate_narrative(ria):
    """Generate a narrative for an RIA profile."""
    # Build a descriptive narrative from the RIA's data
    narrative = f"{ria['name']} is a registered investment adviser located in {ria['city']}, {ria['state']} "
    narrative += f"with SEC file number {ria['sec_number']}. "
    
    # Format AUM
    aum = ria['aum']
    if aum >= 1_000_000_000:
        aum_str = f"${aum/1_000_000_000:.1f} billion"
    else:
        aum_str = f"${aum/1_000_000:.1f} million"
    
    narrative += f"The firm manages approximately {aum_str} in assets "
    narrative += f"and employs {ria['employee_count']} professionals. "
    
    # Add services
    narrative += f"They offer services including {', '.join(ria['services'][:-1])} and {ria['services'][-1]}. "
    
    # Add client types
    narrative += f"The firm primarily serves {', '.join(ria['client_types'][:-1])} and {ria['client_types'][-1]}."
    
    # Add some random additional information
    extra_info = [
        f"The firm was founded in {random.randint(1980, 2020)}.",
        f"They use a proprietary investment methodology focused on long-term growth.",
        f"The firm specializes in tax-efficient investment strategies.",
        f"They provide customized investment solutions based on client goals.",
        f"The firm emphasizes risk management in portfolio construction."
    ]
    
    narrative += " " + random.choice(extra_info)
    
    return narrative

def generate_control_persons(ria_id, count=None):
    """Generate control persons for an RIA."""
    if count is None:
        count = random.randint(1, 5)
    
    control_persons = []
    
    # Generate a list of first names and last names
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Susan", "Richard", "Jessica", "Joseph", "Sarah", "Thomas", "Karen", "Charles", "Nancy", "Christopher", "Lisa", "Daniel", "Margaret", "Matthew", "Betty", "Anthony", "Sandra", "Mark", "Ashley", "Donald", "Dorothy", "Steven", "Kimberly", "Andrew", "Emily", "Paul", "Donna", "Joshua", "Michelle", "Kenneth", "Carol", "Kevin", "Amanda", "Brian", "Melissa", "George", "Deborah", "Timothy", "Stephanie"]
    last_names = ["Smith", "Johnson", "Williams", "Jones", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "Hernandez", "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker", "Gonzalez", "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins"]
    
    # First person is often a founder with higher ownership
    position = random.choice(["Founder", "Managing Partner", "CEO", "President"])
    name = f"{random.choice(first_names)} {random.choice(last_names)}"
    ownership = random.randint(30, 80)
    
    control_persons.append({
        "ria_id": ria_id,
        "name": name,
        "position": position,
        "ownership_percent": ownership,
        "email": f"{name.lower().replace(' ', '.')}@{ria_id}.example.com"
    })
    
    # Remaining ownership to distribute
    remaining = 100 - ownership
    
    # Generate additional control persons
    for i in range(1, count):
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        position = random.choice(executive_positions)
        
        # Last person gets remaining ownership or 0 if we're out
        if i == count - 1:
            person_ownership = remaining
        else:
            person_ownership = min(remaining, random.randint(5, 25))
            remaining -= person_ownership
        
        control_persons.append({
            "ria_id": ria_id,
            "name": name,
            "position": position,
            "ownership_percent": person_ownership,
            "email": f"{name.lower().replace(' ', '.')}@{ria_id}.example.com"
        })
    
    return control_persons

def generate_private_funds(ria_id, count=None):
    """Generate private funds for an RIA."""
    if count is None:
        count = random.randint(0, 4)  # Some may have no funds
    
    private_funds = []
    
    # Fund name components
    fund_prefixes = ["Alpha", "Beta", "Delta", "Gamma", "Omega", "Sigma", "Premier", "Elite", "Core", "Growth", "Value", "Opportunity", "Strategic", "Global", "International", "Domestic", "Special", "Advanced", "Enhanced", "Select"]
    fund_types_expanded = fund_types
    
    for _ in range(count):
        # Generate a fund name
        fund_name = f"{random.choice(fund_prefixes)} {random.choice(fund_types_expanded)}"
        if random.random() < 0.5:  # Sometimes add a numeral or 'Fund'
            fund_name += f" {random.choice(['I', 'II', 'III', 'IV', 'V', 'Fund', 'Partners'])}"
        
        # Select a fund type
        fund_type = random.choice(fund_types_expanded)
        
        # Generate fund AUM - typically a fraction of the firm's total AUM
        fund_aum = random.randint(1000000, 500000000)  # $1M to $500M
        
        private_funds.append({
            "ria_id": ria_id,
            "fund_name": fund_name,
            "fund_type": fund_type,
            "aum": fund_aum,
            "currency": "USD"
        })
    
    return private_funds

def load_sample_data(count=50):
    """Load sample data into the database."""
    console.print("[bold blue]Generating and loading sample data...[/bold blue]")
    
    # Generate RIA profiles
    console.print(f"[blue]Generating {count} sample RIA profiles...[/blue]")
    ria_profiles = generate_ria_profiles(count)
    
    # Insert RIA profiles and collect their IDs
    ria_ids = {}
    
    console.print("[blue]Inserting RIA profiles...[/blue]")
    for profile in ria_profiles:
        try:
            response = supabase.table("ria_profiles").insert(profile).execute()
            if response.data and len(response.data) > 0:
                ria_id = response.data[0]["id"]
                sec_number = profile["sec_number"]
                ria_ids[sec_number] = ria_id
            else:
                console.print(f"[yellow]Warning: No ID returned for {profile['name']}[/yellow]")
        except Exception as e:
            console.print(f"[red]Error inserting RIA profile {profile['name']}: {e}[/red]")
    
    console.print(f"[green]✓ Inserted {len(ria_ids)} RIA profiles[/green]")
    
    # Generate and insert narratives
    console.print("[blue]Generating and inserting narratives...[/blue]")
    for profile in ria_profiles:
        if profile["sec_number"] in ria_ids:
            ria_id = ria_ids[profile["sec_number"]]
            narrative_text = generate_narrative(profile)
            
            try:
                supabase.table("narratives").insert({
                    "ria_id": ria_id,
                    "narrative_text": narrative_text
                }).execute()
            except Exception as e:
                console.print(f"[red]Error inserting narrative for {profile['name']}: {e}[/red]")
    
    # Generate and insert control persons
    console.print("[blue]Generating and inserting control persons...[/blue]")
    control_persons_count = 0
    for sec_number, ria_id in ria_ids.items():
        control_persons = generate_control_persons(ria_id)
        
        try:
            response = supabase.table("control_persons").insert(control_persons).execute()
            control_persons_count += len(control_persons)
        except Exception as e:
            console.print(f"[red]Error inserting control persons for RIA {ria_id}: {e}[/red]")
    
    console.print(f"[green]✓ Inserted {control_persons_count} control persons[/green]")
    
    # Generate and insert private funds
    console.print("[blue]Generating and inserting private funds...[/blue]")
    private_funds_count = 0
    for sec_number, ria_id in ria_ids.items():
        # Higher chance of private funds for certain RIAs
        if random.random() < 0.6:  # 60% chance of having funds
            funds = generate_private_funds(ria_id)
            
            if funds:
                try:
                    response = supabase.table("ria_private_funds").insert(funds).execute()
                    private_funds_count += len(funds)
                except Exception as e:
                    console.print(f"[red]Error inserting private funds for RIA {ria_id}: {e}[/red]")
    
    console.print(f"[green]✓ Inserted {private_funds_count} private funds[/green]")
    
    # Final summary
    console.print("\n[bold green]Sample data loading complete![/bold green]")
    console.print(f"  RIA Profiles: {len(ria_ids)}")
    console.print(f"  Narratives: {len(ria_ids)}")
    console.print(f"  Control Persons: {control_persons_count}")
    console.print(f"  Private Funds: {private_funds_count}")

if __name__ == "__main__":
    # Default to 50 RIAs, or take count from command line
    count = 50
    if len(sys.argv) > 1:
        try:
            count = int(sys.argv[1])
        except ValueError:
            # It might be a non-numeric argument or the key was already processed
            pass
    
    load_sample_data(count)
