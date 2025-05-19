from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.conf import settings
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.pagination import PageNumberPagination
import os
import uuid
import json
import pandas as pd
from datetime import datetime
from decimal import Decimal
from .models import Product, Supplier, SupplierProduct, ImportJob, ImportHistory
from .serializers import (
    ProductSerializer, ProductDetailSerializer,
    SupplierSerializer, SupplierDetailSerializer,
    SupplierProductSerializer, ImportJobSerializer, ImportHistorySerializer
)
from .tasks import process_file_upload, process_supplier_file, process_product_file
from .utils import (
    get_supabase_client, fetch_products, fetch_suppliers, 
    fetch_supplier_products, create_or_update_record, delete_record,
    detect_and_fix_duplicate_supplier_products
)
from django.db import connection

# Health check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({
        'status': 'ok',
        'time': timezone.now().isoformat(),
        'environment': 'development' if settings.DEBUG else 'production'
    })

# Server configuration
@api_view(['GET'])
@permission_classes([AllowAny])
def server_config(request):
    """Return server configuration information for the frontend"""
    
    # Include Supabase credentials for frontend use
    config = {
        'supabase': {
            'url': settings.SUPABASE_URL,
            'anon_key': settings.SUPABASE_KEY,
        },
        'api_url': '/api',
        'debug': settings.DEBUG
    }
    
    return JsonResponse(config)

# Suppliers
@api_view(['GET', 'POST'])
def supplier_list(request):
    if request.method == 'GET':
        search_query = request.query_params.get('search', '')
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        offset = (page - 1) * page_size
        
        filters = {}
        if search_query:
            filters['search'] = search_query
            
        # Use Supabase client instead of Django ORM
        result = fetch_suppliers(filters, limit=page_size, offset=offset)
        suppliers = result.data
        
        # Manual pagination since we're bypassing Django's pagination
        return Response({
            'count': len(suppliers),  # This is not accurate for total count
            'next': None if len(suppliers) < page_size else f'?page={page+1}&page_size={page_size}',
            'previous': None if page <= 1 else f'?page={page-1}&page_size={page_size}',
            'results': suppliers
        })
    
    elif request.method == 'POST':
        # Create a new supplier using Supabase
        try:
            result = create_or_update_record('suppliers', request.data)
            return Response(result.data[0], status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
def supplier_detail(request, pk):
    try:
        # Use Supabase client to get supplier by ID
        supabase = get_supabase_client()
        result = supabase.table('suppliers').select('*').eq('id', str(pk)).execute()
        
        if not result.data:
            return Response(status=status.HTTP_404_NOT_FOUND)
            
        supplier = result.data[0]
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    if request.method == 'GET':
        # Get supplier product count
        product_count_result = supabase.table('supplier_products').select('id').eq('supplier', str(pk)).execute()
        supplier['products_count'] = len(product_count_result.data)
        return Response(supplier)
    
    elif request.method == 'PUT':
        try:
            result = create_or_update_record('suppliers', request.data, 'id', str(pk))
            return Response(result.data[0])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        try:
            delete_record('suppliers', 'id', str(pk))
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Products
@api_view(['GET', 'POST'])
def product_list(request):
    if request.method == 'GET':
        search_query = request.query_params.get('search', '')
        category = request.query_params.get('category', '')
        brand = request.query_params.get('brand', '')
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        offset = (page - 1) * page_size
        
        filters = {}
        if search_query:
            filters['search'] = search_query
        if category:
            filters['category'] = category
        if brand:
            filters['brand'] = brand
            
        # Use Supabase client instead of Django ORM
        result = fetch_products(filters, limit=page_size, offset=offset)
        products = result.data
        
        # Manual pagination since we're bypassing Django's pagination
        return Response({
            'count': len(products),  # This is not accurate for total count
            'next': None if len(products) < page_size else f'?page={page+1}&page_size={page_size}',
            'previous': None if page <= 1 else f'?page={page-1}&page_size={page_size}',
            'results': products
        })
    
    elif request.method == 'POST':
        # Create a new product using Supabase
        try:
            result = create_or_update_record('products', request.data)
            return Response(result.data[0], status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
def product_detail(request, pk):
    try:
        # Use Supabase client to get product by ID
        supabase = get_supabase_client()
        result = supabase.table('products').select('*').eq('id', str(pk)).execute()
        
        if not result.data:
            return Response(status=status.HTTP_404_NOT_FOUND)
            
        product = result.data[0]
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    if request.method == 'GET':
        # Get supplier information
        supplier_products_result = supabase.table('supplier_products').select('*, supplier:suppliers(*)').eq('product', str(pk)).limit(5).execute()
        
        # Process results to match the expected format
        suppliers = []
        for sp in supplier_products_result.data:
            suppliers.append({
                'id': sp['supplier']['id'],
                'name': sp['supplier']['name'],
                'cost': float(sp['cost']),
                'moq': sp['moq'],
                'lead_time': sp['lead_time'],
                'match_method': sp['match_method'],
            })
        
        product['suppliers'] = suppliers
        product['supplier_count'] = len(suppliers)
        return Response(product)
    
    elif request.method == 'PUT':
        try:
            result = create_or_update_record('products', request.data, 'id', str(pk))
            return Response(result.data[0])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        try:
            delete_record('products', 'id', str(pk))
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Supplier Products
@api_view(['GET', 'POST'])
def supplier_product_list(request):
    if request.method == 'GET':
        supplier_id = request.query_params.get('supplier_id', None)
        product_id = request.query_params.get('product_id', None)
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        offset = (page - 1) * page_size
        
        # Use Supabase client instead of Django ORM
        result = fetch_supplier_products(supplier_id, product_id, limit=page_size, offset=offset)
        supplier_products = result.data
        
        # Manual pagination since we're bypassing Django's pagination
        return Response({
            'count': len(supplier_products),  # This is not accurate for total count
            'next': None if len(supplier_products) < page_size else f'?page={page+1}&page_size={page_size}',
            'previous': None if page <= 1 else f'?page={page-1}&page_size={page_size}',
            'results': supplier_products
        })
    
    elif request.method == 'POST':
        # Create a new supplier product using Supabase
        try:
            result = create_or_update_record('supplier_products', request.data)
            return Response(result.data[0], status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
def supplier_product_detail(request, pk):
    try:
        # Use Supabase client to get supplier product by ID
        supabase = get_supabase_client()
        result = supabase.table('supplier_products').select('*, supplier:suppliers(*), product:products(*)').eq('id', str(pk)).execute()
        
        if not result.data:
            return Response(status=status.HTTP_404_NOT_FOUND)
            
        supplier_product = result.data[0]
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    if request.method == 'GET':
        # Add product and supplier names for compatibility with frontend
        supplier_product['supplier_name'] = supplier_product['supplier']['name']
        supplier_product['product_title'] = supplier_product['product']['title']
        return Response(supplier_product)
    
    elif request.method == 'PUT':
        try:
            # Remove any nested objects before update
            if 'supplier' in request.data:
                del request.data['supplier']
            if 'product' in request.data:
                del request.data['product']
                
            result = create_or_update_record('supplier_products', request.data, 'id', str(pk))
            return Response(result.data[0])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        try:
            delete_record('supplier_products', 'id', str(pk))
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# File Upload and Import
@api_view(['GET', 'POST', 'OPTIONS'])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([AllowAny])
@csrf_exempt
def upload_supplier_data(request):
    """
    Endpoint to handle supplier data uploads with improved memory management
    """
    # Handle OPTIONS requests (preflight)
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Allow'] = 'GET, POST, OPTIONS'
        return response
        
    # Handle GET requests (testing connection)
    if request.method == 'GET':
        return Response({'message': 'Upload endpoint is working. Use POST to upload files.'})
    
    # For POST requests, process the file
    if 'file' not in request.FILES:
        return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Log request details to help debug
    print("=" * 40)
    print(f"Processing supplier file upload at {request.path}")
    print(f"Content Type: {request.content_type}")
    print(f"Files: {list(request.FILES.keys())}")
    print("=" * 40)
    
    try:
        uploaded_file = request.FILES['file']
        file_size = uploaded_file.size
        
        print(f"File size: {file_size} bytes ({file_size/1024/1024:.2f} MB)")
        
        # Validate file size
        if file_size > settings.MAX_UPLOAD_SIZE:
            return Response({
                'error': f'File too large. Max size is {settings.MAX_UPLOAD_SIZE / (1024 * 1024)}MB'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate file extension
        file_extension = os.path.splitext(uploaded_file.name)[1].lower()[1:]
        if file_extension not in ['csv', 'xlsx', 'xls']:
            return Response({
                'error': 'Invalid file format. Supported formats: CSV, XLSX, XLS'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create upload directory if it doesn't exist
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        
        # Generate unique filename
        unique_filename = f"{str(uuid.uuid4())}_{uploaded_file.name}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        
        # Save file to disk in chunks to reduce memory usage
        with open(file_path, 'wb+') as destination:
            for chunk in uploaded_file.chunks(chunk_size=1024*1024):  # 1MB chunks
                destination.write(chunk)
        
        print(f"File saved to {file_path}")
        
        # Process field mapping from the frontend
        field_mapping = {}
        
        # Check if field_mapping is a string (JSON) or a dict
        if 'field_mapping' in request.data:
            mapping_data = request.data.get('field_mapping')
            
            # Convert string to dict if needed
            if isinstance(mapping_data, str):
                try:
                    import json
                    mapping_data = json.loads(mapping_data)
                except json.JSONDecodeError:
                    print(f"Error parsing field_mapping JSON: {mapping_data}")
                    mapping_data = {}
            
            # Flatten nested objects if needed
            if isinstance(mapping_data, dict):
                field_mapping = mapping_data
                print(f"Using field mapping: {field_mapping}")
            else:
                print(f"Unexpected field_mapping format: {type(mapping_data)}")
        
        # Get match options
        match_options = {}
        if 'match_options' in request.data:
            try:
                match_options_data = request.data.get('match_options')
                if isinstance(match_options_data, str):
                    match_options = json.loads(match_options_data)
                else:
                    match_options = match_options_data
            except (json.JSONDecodeError, TypeError):
                print(f"Error parsing match_options: {request.data.get('match_options')}")
        
        # Create job object
        job = ImportJob.objects.create(
            user=request.user if request.user.is_authenticated else None,
            file_name=uploaded_file.name,
            file_size=file_size,
            file_path=file_path,
            type='supplier',
            status='pending',
            field_mapping=field_mapping,
            match_options=match_options,
            batch_size=500  # Use a larger batch size for efficiency
        )
        
        print(f"Created import job with ID: {job.id}")
        
        # Start background processing for all files
        # Start processing in the background using threading
        from django.core.management import call_command
        import threading
        thread = threading.Thread(
            target=lambda: call_command('process_supplier_job', job_id=str(job.id))
        )
        thread.daemon = True
        thread.start()
        
        # Return success response immediately with job ID
        return JsonResponse({
            'success': True,
            'message': 'File upload started processing in the background',
            'job_id': str(job.id),
            'id': str(job.id),
            'file_name': uploaded_file.name,
            'file_size': file_size,
            'type': 'supplier',
            'status': 'pending'
        }, status=201)
        
    except Exception as e:
        import traceback
        print(f"Exception in file upload: {str(e)}")
        print(traceback.format_exc())
        return Response({
            'error': f'Server error: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST', 'OPTIONS'])  # Allow more HTTP methods
@parser_classes([MultiPartParser, FormParser])
@permission_classes([AllowAny])  # Only for development
@csrf_exempt  # Exempt this view from CSRF protection
def upload_amazon_data(request):
    """
    Endpoint to handle Amazon product data uploads
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method is allowed'}, status=405)
    
    try:
        # Log the upload request
        print('=' * 40)
        print(f"Processing file upload at {request.path}")
        print(f"Content Type: {request.content_type}")
        print(f"Files: {list(request.FILES.keys())}")
        print('=' * 40)
        
        # Check if a file was uploaded
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'No file uploaded'}, status=400)
        
        uploaded_file = request.FILES['file']
        print(f"File size: {uploaded_file.size} bytes ({uploaded_file.size / 1024 / 1024:.2f} MB)")
        
        # Get field mapping from request
        field_mapping = {}
        
        # Debug what's coming in the request
        print(f"Request POST items: {dict(request.POST.items())}")
        
        # Handle field_ prefixed items
        for key, value in request.POST.items():
            if key.startswith('field_'):
                field_name = key.replace('field_', '')
                field_mapping[field_name] = value
            elif key == 'mapping':
                # Handle the JSON mapping string that's coming from the client
                try:
                    # Parse the JSON string
                    mapping_dict = json.loads(value)
                    # Replace field_mapping with this parsed value
                    field_mapping = mapping_dict
                    print(f"Successfully parsed mapping: {field_mapping}")
                except json.JSONDecodeError:
                    print(f"Failed to parse mapping JSON: {value}")
                    pass
        
        # Create a unique filename
        import uuid
        unique_id = str(uuid.uuid4())
        original_name = uploaded_file.name
        filename = f"{unique_id}_{original_name}"
        file_path = os.path.join('uploads', filename)
        
        # Save the file
        os.makedirs('uploads', exist_ok=True)
        with open(file_path, 'wb+') as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)
        
        print(f"File saved to {file_path}")
        print(f"Field mapping: {field_mapping}")
        
        # Create an import job record
        import_job = ImportJob.objects.create(
            user=request.user if request.user.is_authenticated else None,
            file_name=original_name,
            file_size=uploaded_file.size,  # Add file size which is required
            file_path=file_path,
            field_mapping=field_mapping,
            status='pending',
            type='product',
            total_rows=0,
            progress=0
        )
        print(f"Created import job with ID: {import_job.id}")
        
        # Start processing in the background
        from django.core.management import call_command
        import threading
        thread = threading.Thread(
            target=lambda: call_command('process_import_job', job_id=str(import_job.id))
        )
        thread.daemon = True
        thread.start()
        
        # Return success response immediately with job ID
        return JsonResponse({
            'success': True, 
            'message': 'File upload started processing',
            'job_id': str(import_job.id)
        })
        
    except Exception as e:
        import traceback
        print(f"Error processing file: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([AllowAny])  # Allow anonymous access to check status
@csrf_exempt
def job_status(request, job_id):
    try:
        job = ImportJob.objects.get(pk=job_id)
    except ImportJob.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    serializer = ImportJobSerializer(job)
    response_data = serializer.data
    
    # Add job_id field for frontend compatibility
    response_data['job_id'] = str(job.id)
    
    return Response(response_data)

@api_view(['GET'])
def import_history(request):
    # Get all import history or filter by type
    import_type = request.query_params.get('type', None)
    
    history = ImportHistory.objects.all().order_by('-created_at')
    
    if import_type:
        history = history.filter(type=import_type)
    
    # Pagination
    paginator = PageNumberPagination()
    paginator.page_size = request.query_params.get('page_size', 10)
    result_page = paginator.paginate_queryset(history, request)
    
    serializer = ImportHistorySerializer(result_page, many=True)
    return paginator.get_paginated_response(serializer.data)

@api_view(['GET'])
def profit_analysis(request):
    """
    Calculate profit margins for products based on supplier costs
    """
    product_id = request.query_params.get('product_id', None)
    supplier_id = request.query_params.get('supplier_id', None)
    
    if product_id:
        # Get a specific product and its suppliers
        try:
            product = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        
        supplier_products = product.supplier_products.all()
        
        if supplier_id:
            supplier_products = supplier_products.filter(supplier_id=supplier_id)
        
        if not supplier_products:
            return Response({'error': 'No supplier data found for this product'}, status=status.HTTP_404_NOT_FOUND)
        
        # Calculate profit for each supplier
        results = []
        for sp in supplier_products:
            supplier_cost = float(sp.cost)
            sale_price = float(product.sale_price)
            amazon_fee = float(product.amazon_fee)
            
            profit = sale_price - supplier_cost - amazon_fee
            margin = (profit / sale_price) * 100 if sale_price > 0 else 0
            
            results.append({
                'supplier_id': sp.supplier.id,
                'supplier_name': sp.supplier.name,
                'cost': supplier_cost,
                'moq': sp.moq,
                'lead_time': sp.lead_time,
                'payment_terms': sp.payment_terms,
                'sale_price': sale_price,
                'amazon_fee': amazon_fee,
                'profit': round(profit, 2),
                'margin': round(margin, 2),
            })
        
        return Response({
            'product': ProductSerializer(product).data,
            'profit_analysis': results
        })
    else:
        # Get top products by profitability
        limit = int(request.query_params.get('limit', 50))
        
        products_with_suppliers = Product.objects.filter(supplier_products__isnull=False).distinct()
        
        results = []
        for product in products_with_suppliers[:limit]:
            lowest_cost_sp = product.supplier_products.order_by('cost').first()
            
            if lowest_cost_sp:
                supplier_cost = float(lowest_cost_sp.cost)
                sale_price = float(product.sale_price)
                amazon_fee = float(product.amazon_fee)
                
                profit = sale_price - supplier_cost - amazon_fee
                margin = (profit / sale_price) * 100 if sale_price > 0 else 0
                
                results.append({
                    'product_id': product.id,
                    'product_title': product.title,
                    'best_supplier': {
                        'supplier_id': lowest_cost_sp.supplier.id,
                        'supplier_name': lowest_cost_sp.supplier.name,
                        'cost': supplier_cost,
                    },
                    'sale_price': sale_price,
                    'profit': round(profit, 2),
                    'margin': round(margin, 2),
                })
        
        # Sort results by profit margin in descending order
        results = sorted(results, key=lambda x: x['margin'], reverse=True)
        
        return Response(results)

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([AllowAny])
def debug_request(request):
    """Debug view to print request details"""
    print("=" * 40)
    print("DEBUG REQUEST INFO")
    print("=" * 40)
    print(f"Request Method: {request.method}")
    print(f"Request Path: {request.path}")
    print(f"Content Type: {request.content_type}")
    print("Headers:")
    for key, value in request.headers.items():
        print(f"  {key}: {value}")
    print("Body:")
    for key, value in request.data.items():
        print(f"  {key}: {type(value)}")
    print("Files:")
    for key, value in request.FILES.items():
        print(f"  {key}: {value.name} ({value.size} bytes)")
    print("=" * 40)
    
    return Response({"message": "Request details printed to console"}, status=200)

@api_view(['GET', 'POST', 'OPTIONS'])
@permission_classes([AllowAny])
@csrf_exempt
def debug_upload(request):
    """Debug view to test upload endpoint"""
    print("=" * 40)
    print("DEBUG UPLOAD REQUEST")
    print("=" * 40)
    print(f"Request Method: {request.method}")
    print(f"Request Path: {request.path}")
    print(f"Content Type: {request.content_type}")
    print("Headers:")
    for key, value in request.headers.items():
        print(f"  {key}: {value}")
    
    # Return simple text for all methods
    return HttpResponse(
        f"Debug upload endpoint received {request.method} request at {request.path}",
        content_type="text/plain"
    )

@api_view(['GET'])
@permission_classes([AllowAny])
def recently_imported_products(request):
    """Return a list of recently imported products"""
    # Get the latest import job that was completed
    try:
        latest_job = ImportJob.objects.filter(status='completed', type='product').order_by('-completed_at').first()
        
        if not latest_job:
            return Response({'message': 'No completed import jobs found'}, status=status.HTTP_404_NOT_FOUND)
            
        # Get the products from the latest import
        # Since we don't track which products were imported in which job,
        # we'll return the most recent products based on creation time
        recent_products = Product.objects.all().order_by('-id')[:50]
        
        serializer = ProductSerializer(recent_products, many=True)
        
        return Response({
            'import_job': {
                'id': latest_job.id,
                'file_name': latest_job.file_name,
                'completed_at': latest_job.completed_at,
                'total_records': latest_job.total_rows,
                'successful': latest_job.results.get('successful', 0) if latest_job.results else 0,
                'failed': latest_job.results.get('failed', 0) if latest_job.results else 0
            },
            'products': serializer.data
        })
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Job Status Check Endpoint
@api_view(['GET'])
@permission_classes([AllowAny])  # Only for development
def check_job_status(request, job_id):
    try:
        job = ImportJob.objects.get(pk=job_id)
        
        # Prepare response with job status
        response_data = {
            'id': str(job.id),
            'status': job.status,
            'progress': job.progress,
            'status_message': job.status_message,
            'total_rows': job.total_rows,
            'created_at': job.created_at,
            'updated_at': job.updated_at
        }
        
        # Add results if job is completed
        if job.status == 'completed' and job.results:
            response_data['results'] = job.results
        
        return Response(response_data)
        
    except ImportJob.DoesNotExist:
        return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Cancel Job Endpoint
@api_view(['POST'])
@permission_classes([AllowAny])  # Only for development
@csrf_exempt
def cancel_import_job(request, job_id):
    """
    Cancel an import job that's in progress
    """
    try:
        # Use Supabase client to get job by ID
        supabase = get_supabase_client()
        result = supabase.table('import_jobs').select('*').eq('id', job_id).execute()
        
        if not result.data:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)
            
        job = result.data[0]
        
        # Only allow cancellation of jobs that are still processing
        if job['status'] not in ['waiting', 'processing']:
            return Response({
                'error': 'Cannot cancel job that is not in progress',
                'status': job['status']
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update job status to cancelled
        supabase.table('import_jobs').update({
            'status': 'cancelled',
            'status_message': 'Cancelled by user',
            'completed_at': timezone.now().isoformat()
        }).eq('id', job_id).execute()
        
        return Response({
            'status': 'success',
            'message': 'Job cancelled successfully'
        })
    except Exception as e:
        return Response({
            'error': f'Error cancelling job: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])  # Only for development and admin tools
@csrf_exempt
def fix_duplicates(request):
    """
    API endpoint to detect and fix duplicate supplier product entries.
    This helps resolve issues with constraint violations during imports.
    """
    try:
        result = detect_and_fix_duplicate_supplier_products()
        return Response(result)
    except Exception as e:
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Add new endpoints for supplier product statistics
@api_view(['GET'])
def supplier_product_stats(request, supplier_id):
    """
    Get statistics for supplier products (min/max cost)
    Used for filtering in the frontend
    """
    try:
        # Query the database for cost statistics
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    MIN(cost) as min_cost,
                    MAX(cost) as max_cost
                FROM supplier_products
                WHERE supplier_id = %s
            """, [supplier_id])
            
            result = cursor.fetchone()
            
        # Handle case where no products exist
        if not result or not result[0]:
            return Response({
                'data': {
                    'minCost': 0,
                    'maxCost': 100
                },
                'error': None
            })
        
        # Return the cost range
        return Response({
            'data': {
                'minCost': float(result[0]),
                'maxCost': float(result[1])
            },
            'error': None
        })
        
    except Exception as e:
        print(f"Error fetching supplier product stats: {str(e)}")
        return Response({
            'data': {
                'minCost': 0,
                'maxCost': 100
            },
            'error': str(e)
        })

@api_view(['GET'])
def supplier_product_methods(request, supplier_id):
    """
    Get unique match methods for supplier products
    Used for filtering in the frontend
    """
    try:
        # Query the database for unique match methods
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT match_method
                FROM supplier_products
                WHERE supplier_id = %s AND match_method IS NOT NULL
            """, [supplier_id])
            
            methods = [row[0] for row in cursor.fetchall()]
            
        # Return the match methods
        return Response({
            'data': {
                'matchMethods': methods
            },
            'error': None
        })
        
    except Exception as e:
        print(f"Error fetching supplier product match methods: {str(e)}")
        return Response({
            'data': {
                'matchMethods': []
            },
            'error': str(e)
        }) 