#!/usr/bin/env python3
"""
Simple Supabase connection test using the Supabase client.
"""

import os
from supabase import create_client, Client
from rich.console import Console
from dotenv import load_dotenv

console = Console()

# Load environment variables
load_dotenv('env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

console.print(f"[blue]Testing Supabase connection...[/blue]")
console.print(f"URL: {SUPABASE_URL}")
console.print(f"Key: {'***' + SUPABASE_SERVICE_KEY[-10:] if SUPABASE_SERVICE_KEY else 'NOT SET'}")

try:
    # Create Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Try a simple query to test connection
    # Check if advisers table exists by trying to count rows
    response = supabase.table('advisers').select('*', count='exact').limit(0).execute()
    
    console.print(f"[green]✓ Connected to Supabase successfully![/green]")
    console.print(f"[green]✓ 'advisers' table exists with {response.count} rows[/green]")
    
except Exception as e:
    error_msg = str(e)
    if 'relation "public.advisers" does not exist' in error_msg:
        console.print("[yellow]⚠ Connected to Supabase but tables not found![/yellow]")
        console.print("[yellow]Please run the SQL script to create tables:[/yellow]")
        console.print("[cyan]1. Go to: https://app.supabase.com/project/llusjnpltqxhokycwzry/sql[/cyan]")
        console.print("[cyan]2. Copy contents of scripts/create_ria_hunter_schema.sql[/cyan]")
        console.print("[cyan]3. Paste and execute in SQL editor[/cyan]")
    else:
        console.print(f"[red]Error: {e}[/red]")

# Test other tables if advisers exists
try:
    tables_to_check = ['filings', 'private_funds', 'ria_narratives']
    for table in tables_to_check:
        response = supabase.table(table).select('*', count='exact').limit(0).execute()
        console.print(f"[green]✓ '{table}' table exists with {response.count} rows[/green]")
except Exception as e:
    pass  # Tables might not exist yet