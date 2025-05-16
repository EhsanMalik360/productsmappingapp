from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """
        Run any app initialization code here
        """
        # Import celery task modules to ensure they're registered
        import api.tasks