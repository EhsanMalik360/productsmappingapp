import os
import time
import json
import gc
from django.core.management.base import BaseCommand
from api.models import ImportJob
from api.tasks import process_supplier_file

class Command(BaseCommand):
    help = 'Process a supplier import job asynchronously with memory optimization'

    def add_arguments(self, parser):
        parser.add_argument('--job_id', type=str, required=True, help='The ID of the import job to process')

    def handle(self, *args, **options):
        job_id = options['job_id']
        self.stdout.write(self.style.SUCCESS(f'Processing supplier import job {job_id}'))
        
        try:
            # Get the job
            job = ImportJob.objects.get(id=job_id)
            
            # Update status
            job.status = 'processing'
            job.save()
            
            # Force garbage collection before starting
            gc.collect()
            
            # Process the file with memory optimization
            self.stdout.write(f'Starting processing for file: {job.file_name}')
            process_supplier_file(job)
            
            # Clean up memory
            gc.collect()
            
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
            
            # Clean up memory
            gc.collect() 