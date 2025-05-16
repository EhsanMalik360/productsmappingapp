@echo off
echo Starting Django server with Supabase integration...

REM Check if virtual environment exists, if not create it
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

REM Collect Supabase credentials
set /p SUPABASE_URL="Enter your Supabase URL (or press enter to use environment variable): "
set /p SUPABASE_KEY="Enter your Supabase Key (or press enter to use environment variable): "

REM Set Supabase API mode to true by default
set USE_SUPABASE_API=True

echo Using Supabase REST API instead of direct database connection

REM Run Django with the custom management command
if "%SUPABASE_URL%"=="" (
    if "%SUPABASE_KEY%"=="" (
        python manage.py run_server
    ) else (
        python manage.py run_server --supabase-key="%SUPABASE_KEY%"
    )
) else (
    if "%SUPABASE_KEY%"=="" (
        python manage.py run_server --supabase-url="%SUPABASE_URL%"
    ) else (
        python manage.py run_server --supabase-url="%SUPABASE_URL%" --supabase-key="%SUPABASE_KEY%"
    )
)

pause 