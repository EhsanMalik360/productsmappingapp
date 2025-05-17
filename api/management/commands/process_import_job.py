import os
import time
import json
from django.core.management.base import BaseCommand
from api.models import ImportJob
from api.tasks import process_product_file

class Command(BaseCommand):
    help = 'Process a product import job asynchronously'

    def add_arguments(self, parser):
        parser.add_argument('--job_id', type=str, required=True, help='The ID of the import job to process')

    def handle(self, *args, **options):
        job_id = options['job_id']
        self.stdout.write(self.style.SUCCESS(f'Processing import job {job_id}'))
        
        try:
            # Get the job
            job = ImportJob.objects.get(id=job_id)
            
            # Update status
            job.status = 'processing'
            job.save()
            
            # Check field mapping
            try:
                if isinstance(job.field_mapping, dict) and 'mapping' in job.field_mapping:
                    mapping_str = job.field_mapping['mapping']
                    if isinstance(mapping_str, str):
                        try:
                            # Parse the JSON string in the mapping field
                            job.field_mapping = json.loads(mapping_str)
                            job.save()
                            self.stdout.write(f"Fixed nested field mapping: {job.field_mapping}")
                        except json.JSONDecodeError:
                            self.stdout.write(self.style.WARNING(f"Could not parse mapping JSON: {mapping_str}"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Error checking field mapping: {str(e)}"))
            
            # Process the file
            self.stdout.write(f'Starting processing for file: {job.file_name}')
            process_product_file(job)
            
            self.stdout.write(self.style.SUCCESS(f'Successfully processed import job {job_id}'))
        except ImportJob.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Import job with ID {job_id} does not exist'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error processing import job {job_id}: {str(e)}'))
            # Update job status to failed
            try:
                job = ImportJob.objects.get(id=job_id)
                job.status = 'failed'
                job.status_message = str(e)
                job.save()
            except Exception:
                pass 