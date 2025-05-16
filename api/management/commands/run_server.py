import os
import subprocess
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command

class Command(BaseCommand):
    help = 'Runs Django development server configured for Supabase connection'

    def add_arguments(self, parser):
        parser.add_argument(
            '--supabase-url',
            dest='supabase_url',
            help='Supabase URL',
        )
        parser.add_argument(
            '--supabase-key',
            dest='supabase_key',
            help='Supabase Key',
        )
        parser.add_argument(
            '--use-supabase-api',
            dest='use_supabase_api',
            action='store_true',
            default=True,
            help='Use Supabase REST API instead of direct PostgreSQL connection',
        )
        parser.add_argument(
            '--port',
            dest='port',
            default=8000,
            type=int,
            help='Port to run the server on',
        )

    def handle(self, *args, **options):
        # Set environment variables if provided
        if options['supabase_url']:
            os.environ['SUPABASE_URL'] = options['supabase_url']
            
        if options['supabase_key']:
            os.environ['SUPABASE_KEY'] = options['supabase_key']
            
        # Set the USE_SUPABASE_API flag
        if options['use_supabase_api']:
            os.environ['USE_SUPABASE_API'] = 'True'
        else:
            os.environ['USE_SUPABASE_API'] = 'False'
        
        # Ensure required environment variables are set
        if not os.environ.get('SUPABASE_URL'):
            self.stdout.write(self.style.WARNING('SUPABASE_URL environment variable not set'))
            supabase_url = input('Please enter your Supabase URL: ')
            os.environ['SUPABASE_URL'] = supabase_url
            
        if not os.environ.get('SUPABASE_KEY'):
            self.stdout.write(self.style.WARNING('SUPABASE_KEY environment variable not set'))
            supabase_key = input('Please enter your Supabase Key: ')
            os.environ['SUPABASE_KEY'] = supabase_key
            
        port = options['port']
        
        # Print configuration
        self.stdout.write(self.style.SUCCESS('Starting server with:'))
        self.stdout.write(f'SUPABASE_URL: {os.environ.get("SUPABASE_URL")}')
        self.stdout.write(f'SUPABASE_KEY: {"*" * 8}{os.environ.get("SUPABASE_KEY")[-4:] if os.environ.get("SUPABASE_KEY") else "Not set"}')
        self.stdout.write(f'USE_SUPABASE_API: {os.environ.get("USE_SUPABASE_API")}')
        
        # Run the server
        self.stdout.write(self.style.SUCCESS(f'Starting development server at port {port}...'))
        call_command('runserver', f'0.0.0.0:{port}') 