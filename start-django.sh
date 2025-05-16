#!/bin/bash

echo "Starting Django server with Supabase integration..."

# Check if virtual environment exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Collect Supabase credentials
read -p "Enter your Supabase URL (or press enter to use environment variable): " SUPABASE_URL_INPUT
read -p "Enter your Supabase Key (or press enter to use environment variable): " SUPABASE_KEY_INPUT

# Set Supabase API mode to true by default
export USE_SUPABASE_API=True

echo "Using Supabase REST API instead of direct database connection"

# Run Django with the custom management command
if [ -z "$SUPABASE_URL_INPUT" ]; then
    if [ -z "$SUPABASE_KEY_INPUT" ]; then
        python manage.py run_server
    else
        python manage.py run_server --supabase-key="$SUPABASE_KEY_INPUT"
    fi
else
    if [ -z "$SUPABASE_KEY_INPUT" ]; then
        python manage.py run_server --supabase-url="$SUPABASE_URL_INPUT"
    else
        python manage.py run_server --supabase-url="$SUPABASE_URL_INPUT" --supabase-key="$SUPABASE_KEY_INPUT"
    fi
fi 