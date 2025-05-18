from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from api.models import UserProfile

class Command(BaseCommand):
    help = 'Creates the initial admin user'

    def handle(self, *args, **options):
        # Admin user credentials
        username = 'admin'
        email = 'tahir@leverify.com'
        password = 'S@hiwal900KM'
        
        # Check if admin user already exists
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(
                f'Admin user with username "{username}" already exists'
            ))
            return
        
        # Create admin user
        admin_user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Admin',
            last_name='User',
            is_staff=True,
            is_superuser=True
        )
        
        # Create admin profile
        UserProfile.objects.create(
            user=admin_user,
            role='admin',
            is_active=True
        )
        
        self.stdout.write(self.style.SUCCESS(
            f'Admin user created with username: {username}, email: {email}'
        )) 