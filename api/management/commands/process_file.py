from django.core.management.base import BaseCommand
from api.models import ImportJob
from api.tasks import process_file_upload

class Command(BaseCommand):
    help = 'Process a file upload job directly (not using Celery)'

    def add_arguments(self, parser):
        parser.add_argument('job_id', type=str, help='ID of the job to process')

    def handle(self, *args, **options):
        job_id = options['job_id']
        
        try:
            job = ImportJob.objects.get(pk=job_id)
            self.stdout.write(self.style.SUCCESS(f'Found job {job_id} with type {job.type} and status {job.status}'))
            
            self.stdout.write('Starting processing...')
            # Process the job directly instead of using Celery
            process_file_upload(job_id)
            
            # Reload the job to get the updated status
            job.refresh_from_db()
            
            if job.status == 'completed':
                self.stdout.write(self.style.SUCCESS(f'Job completed successfully'))
                self.stdout.write(f'Results: {job.results}')
            else:
                self.stdout.write(self.style.ERROR(f'Job failed with status {job.status}'))
                self.stdout.write(f'Error message: {job.status_message}')
                
        except ImportJob.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Job {job_id} not found'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error processing job: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc()) 