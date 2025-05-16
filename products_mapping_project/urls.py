"""
URL configuration for products_mapping_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
from django.views.decorators.csrf import csrf_exempt
from api.views import upload_amazon_data, upload_supplier_data, job_status, debug_upload

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API routes
    path('api/', include('api.urls')),
    
    # Direct debug endpoints
    path('upload-debug/', debug_upload, name='main_debug_upload'),
    
    # Direct upload endpoints for maximum compatibility
    path('upload/amazon/', csrf_exempt(upload_amazon_data), name='direct_upload_amazon'),
    path('upload/supplier/', csrf_exempt(upload_supplier_data), name='direct_upload_supplier'),
    path('upload/product/', csrf_exempt(upload_amazon_data), name='direct_upload_product'),
    path('upload/status/<uuid:job_id>/', csrf_exempt(job_status), name='direct_job_status'),
    
    # Debug tools
    path('credentials-debug/', TemplateView.as_view(template_name='credentials-debug.html')),
    
    # Direct template with Supabase CDN
    path('direct/', TemplateView.as_view(template_name='direct_index.html')),
    
    # Serve static files in production
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
    
    # Serve assets directly
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': settings.BASE_DIR / 'dist' / 'assets'}),
    
    # Serve React App - catch all routes and let React handle routing
    re_path(r'^(?!api/|admin/|static/|assets/|media/).*$', TemplateView.as_view(template_name='index.html')),
]

# Serve static and media files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
