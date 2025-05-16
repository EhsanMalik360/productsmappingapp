#!/usr/bin/env python
"""
Apply Supabase migration script to the database.
"""
import os
import sys
import psycopg2
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def apply_migration(migration_file):
    """Apply a SQL migration file to the Supabase database."""
    # Get database connection details from environment
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    
    if not supabase_url:
        print("Error: SUPABASE_URL environment variable not set.")
        sys.exit(1)
    
    if not supabase_key:
        print("Error: SUPABASE_KEY environment variable not set.")
        sys.exit(1)
    
    # Extract database connection information from SUPABASE_URL
    parsed_url = urlparse(supabase_url)
    
    # The host is in the netloc part (without the port)
    db_host = parsed_url.netloc.split(':')[0]
    
    # Default Supabase project uses 'postgres' as database name
    db_name = os.getenv('DB_NAME', 'postgres')
    
    # Supabase connection typically uses 'postgres' user and password from SUPABASE_KEY
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', supabase_key)
    
    # Use Supabase connection pooler port by default (6543)
    db_port = os.getenv('DB_PORT', '6543')
    
    # Read the migration SQL
    with open(migration_file, 'r') as f:
        sql = f.read()
    
    # Connect to the database
    try:
        print(f"Connecting to database {db_name} at {db_host}:{db_port}...")
        conn = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port,
            sslmode=os.getenv('DB_SSL_MODE', 'require')
        )
        conn.autocommit = True
        
        # Create a cursor
        cur = conn.cursor()
        
        # Execute the migration
        print(f"Applying migration: {migration_file}")
        cur.execute(sql)
        
        # Close the cursor and connection
        cur.close()
        conn.close()
        
        print("Migration applied successfully!")
        
    except Exception as e:
        print(f"Error applying migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Define the migration file path
    if len(sys.argv) > 1:
        migration_file = sys.argv[1]
    else:
        migration_file = "supabase/migrations/20250430000000_amazon_import_columns.sql"
    
    # Check if the migration file exists
    if not os.path.exists(migration_file):
        print(f"Error: Migration file {migration_file} not found.")
        sys.exit(1)
    
    # Apply the migration
    apply_migration(migration_file) 