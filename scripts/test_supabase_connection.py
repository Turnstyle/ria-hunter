#!/usr/bin/env python3
"""
Test Supabase connection and check if tables exist.
"""

import os
import sys
from sqlalchemy import create_engine, text
from rich.console import Console
from dotenv import load_dotenv

console = Console()

# Load environment variables
load_dotenv('env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    console.print("[red]Error: Missing Supabase credentials[/red]")
    console.print("SUPABASE_URL:", SUPABASE_URL)
    console.print("SUPABASE_SERVICE_KEY:", "***" if SUPABASE_SERVICE_KEY else "NOT SET")
    sys.exit(1)

# Extract database connection details
project_ref = SUPABASE_URL.split('//')[1].split('.')[0]
db_host = f"db.{project_ref}.supabase.co"
db_url = f"postgresql://postgres.{project_ref}:{SUPABASE_SERVICE_KEY}@{db_host}:5432/postgres"

console.print(f"[blue]Connecting to Supabase project: {project_ref}[/blue]")

try:
    # Create engine and test connection
    engine = create_engine(db_url, echo=False)
    
    with engine.connect() as conn:
        # Test basic connection
        result = conn.execute(text("SELECT version()"))
        version = result.scalar()
        console.print(f"[green]✓ Connected to PostgreSQL: {version}[/green]")
        
        # Check for RIA Hunter tables
        result = conn.execute(
            text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('advisers', 'filings', 'private_funds', 'ria_narratives')
                ORDER BY table_name
            """)
        )
        tables = [row[0] for row in result]
        
        if tables:
            console.print(f"\n[green]✓ Found RIA Hunter tables:[/green]")
            for table in tables:
                console.print(f"  - {table}")
                
            # Get row counts
            console.print("\n[blue]Table row counts:[/blue]")
            for table in tables:
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = count_result.scalar()
                console.print(f"  - {table}: {count:,} rows")
        else:
            console.print("\n[yellow]⚠ RIA Hunter tables not found![/yellow]")
            console.print("[yellow]Please run the SQL script in scripts/create_ria_hunter_schema.sql[/yellow]")
            console.print(f"[yellow]Go to: https://app.supabase.com/project/{project_ref}/sql[/yellow]")
            
            # Show existing tables
            result = conn.execute(
                text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    LIMIT 10
                """)
            )
            existing = [row[0] for row in result]
            if existing:
                console.print("\n[blue]Existing tables in database:[/blue]")
                for table in existing:
                    console.print(f"  - {table}")
                    
except Exception as e:
    console.print(f"[red]Connection failed: {e}[/red]")
    console.print("\n[yellow]Troubleshooting tips:[/yellow]")
    console.print("1. Check that your Supabase project is active")
    console.print("2. Verify SUPABASE_SERVICE_ROLE_KEY in env.local")
    console.print("3. Ensure your IP is not blocked by Supabase")

if __name__ == "__main__":
    pass  # Script runs directly