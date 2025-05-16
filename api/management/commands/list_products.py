from django.core.management.base import BaseCommand
from api.models import Product, ImportJob, ImportHistory

class Command(BaseCommand):
    help = 'Lists products in the database'

    def handle(self, *args, **options):
        # Show import jobs first
        self.stdout.write(self.style.SUCCESS('--- Recent Import Jobs ---'))
        jobs = ImportJob.objects.all().order_by('-created_at')[:5]
        if jobs:
            for job in jobs:
                self.stdout.write(f"Job ID: {job.id}")
                self.stdout.write(f"Status: {job.status}")
                self.stdout.write(f"File: {job.file_name}")
                self.stdout.write(f"Created: {job.created_at}")
                self.stdout.write(f"Message: {job.status_message}")
                self.stdout.write(f"Results: {job.results}")
                self.stdout.write('---')
        else:
            self.stdout.write(self.style.WARNING('No import jobs found'))
            
        # Show import history
        self.stdout.write(self.style.SUCCESS('--- Recent Import History ---'))
        history = ImportHistory.objects.all().order_by('-created_at')[:5]
        if history:
            for entry in history:
                self.stdout.write(f"Type: {entry.type}")
                self.stdout.write(f"File: {entry.file_name}")
                self.stdout.write(f"Status: {entry.status}")
                self.stdout.write(f"Created: {entry.created_at}")
                self.stdout.write(f"Total: {entry.total_records}, Success: {entry.successful_records}, Failed: {entry.failed_records}")
                self.stdout.write('---')
        else:
            self.stdout.write(self.style.WARNING('No import history found'))
        
        # Count products
        product_count = Product.objects.count()
        self.stdout.write(self.style.SUCCESS(f'Total products in database: {product_count}'))
        
        # List most recent products
        if product_count > 0:
            self.stdout.write(self.style.SUCCESS('--- Recent Products ---'))
            products = Product.objects.all().order_by('-id')[:10]
            for product in products:
                self.stdout.write(f"Title: {product.title}")
                self.stdout.write(f"EAN: {product.ean}")
                self.stdout.write(f"Brand: {product.brand}")
                self.stdout.write(f"Sale Price: ${product.sale_price}")
                self.stdout.write('---')
        else:
            self.stdout.write(self.style.WARNING('No products found in database')) 