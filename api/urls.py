from django.urls import path
from . import views
from django.views.decorators.csrf import csrf_exempt

urlpatterns = [
    # Health check
    path('health/', views.health_check, name='health_check'),
    path('config/', views.server_config, name='server_config'),
    
    # Debug endpoints
    path('debug-request/', views.debug_request, name='debug_request'),
    path('debug-upload/', views.debug_upload, name='api_debug_upload'),
    
    # Suppliers
    path('suppliers/', views.supplier_list, name='supplier_list'),
    path('suppliers/<uuid:pk>/', views.supplier_detail, name='supplier_detail'),
    
    # Products
    path('products/', views.product_list, name='product_list'),
    path('products/<uuid:pk>/', views.product_detail, name='product_detail'),
    path('products/imported/', views.recently_imported_products, name='recently_imported_products'),
    
    # Supplier Products
    path('supplier-products/', views.supplier_product_list, name='supplier_product_list'),
    path('supplier-products/<uuid:pk>/', views.supplier_product_detail, name='supplier_product_detail'),
    
    # Import endpoints - add direct endpoints at the root for compatibility
    path('upload/supplier/', csrf_exempt(views.upload_supplier_data), name='upload_supplier_data'),
    path('upload/amazon/', csrf_exempt(views.upload_amazon_data), name='upload_amazon_data'),
    path('upload/amazon', csrf_exempt(views.upload_amazon_data), name='upload_amazon_data_no_slash'),  # No trailing slash version
    path('upload/product/', csrf_exempt(views.upload_amazon_data), name='upload_product_data'),  # Alias for upload/amazon
    path('upload/product', csrf_exempt(views.upload_amazon_data), name='upload_product_data_no_slash'),  # No trailing slash version
    path('upload/status/<uuid:job_id>/', views.job_status, name='job_status'),
    path('import-history/', views.import_history, name='import_history'),
    
    # Profit analysis
    path('profit-analysis/', views.profit_analysis, name='profit_analysis'),
    
    # Profit formulas
    path('profit-formulas/', views.profit_formulas, name='profit_formulas'),
    path('profit-formulas/<uuid:pk>/', views.profit_formula_detail, name='profit_formula_detail'),
    
    # Import endpoints with explicit debug path
    path('upload-debug/amazon/', csrf_exempt(views.upload_amazon_data), name='debug_amazon_upload'),
    path('upload-debug/supplier/', csrf_exempt(views.upload_supplier_data), name='debug_supplier_upload'),
    
    # Job status and control
    path('jobs/<uuid:job_id>/', views.check_job_status, name='check_job_status'),
    path('upload/cancel/<uuid:job_id>/', views.cancel_import_job, name='cancel_import_job'),
    
    # Admin tools
    path('admin/fix-duplicates/', csrf_exempt(views.fix_duplicates), name='fix_duplicates'),
] 