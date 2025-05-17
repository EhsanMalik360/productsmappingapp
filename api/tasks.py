from django.utils import timezone
from django.db import connection, reset_queries
from celery import shared_task
import uuid
import os
import csv
import io
import json
import pandas as pd
import traceback
import tempfile
import time
from datetime import datetime
from decimal import Decimal
from .models import ImportJob, Product, Supplier, SupplierProduct, ImportHistory
from .utils import get_supabase_client, auto_map_amazon_fields, fix_scientific_notation, sanitize_json_object

@shared_task
def process_file_upload(job_id):
    """
    Process a file upload in the background
    """
    try:
        # Get the job
        job = ImportJob.objects.get(pk=job_id)
        
        # Update job status
        job.status = 'processing'
        job.started_at = timezone.now()
        job.save()
        
        # Process file based on type
        if job.type == 'supplier':
            process_supplier_file(job)
        elif job.type == 'product':
            process_product_file(job)
        else:
            job.status = 'failed'
            job.status_message = f"Unknown import type: {job.type}"
            job.save()
            
    except Exception as e:
        # Update job with error
        if job:
            job.status = 'failed'
            job.status_message = str(e)
            job.save()
        
        # Log error
        print(f"Error processing file upload: {str(e)}")
        print(traceback.format_exc())

def process_supplier_file(job):
    """
    Process a supplier file upload
    Optimized for large files using direct Supabase operations
    """
    try:
        # Get file path from job
        file_path = job.file_path
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        # Log the start with clear indicators for tracking
        print(f"=== SUPPLIER IMPORT STARTED ===")
        print(f"🚀 Starting import for job ID: {job.id}")
        print(f"📁 File: {job.file_name}")
        job.status_message = "Reading file..."
        job.progress = 1
        job.save()
        print(f"👉 Progress: 1% - Reading file")
        
        # Read file based on extension - Always use string dtype for all columns
        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext == '.csv':
            # Force all columns to be string type to avoid type conversion issues
            df = pd.read_csv(file_path, dtype=str, keep_default_na=False, encoding='utf-8-sig')
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, dtype=str, keep_default_na=False)
        else:
            raise ValueError(f"Unsupported file format: {file_ext}")
            
        # Update job with total rows
        total_rows = len(df)
        if total_rows == 0:
            raise ValueError("File contains no data")
            
        job.total_rows = total_rows
        job.status_message = f"Processing {total_rows} rows..."
        job.progress = 2
        job.save()
        
        # Log basic info about the dataframe
        print(f"📊 File read successfully. Total rows: {len(df)}")
        print(f"📋 Columns found: {df.columns.tolist()}")
        print(f"👉 Progress: 2% - File parsed, beginning processing")
        
        # Get field mapping from job - clone it to avoid modifying the original
        field_mapping = {}
        if job.field_mapping:
            # Process field mapping
            print("🔍 Processing field mapping from frontend")
            for key, value in job.field_mapping.items():
                field_mapping[key] = value
                field_mapping[key.lower()] = value
                
                # Map frontend field names to backend field names
                if key == 'Supplier Name':
                    field_mapping['supplier_name'] = value
                elif key == 'Brand':
                    field_mapping['brand'] = value
                elif key == 'Product name' or key == 'Product Name':
                    field_mapping['product_name'] = value
                elif key == 'EAN':
                    field_mapping['ean'] = value
                elif key == 'MPN':
                    field_mapping['mpn'] = value
                elif key == 'Supplier Cost' or key == 'Cost':
                    field_mapping['supplier_cost'] = value
                    field_mapping['cost'] = value
                elif key == 'Supplier stock' or key == 'Supplier Stock':
                    field_mapping['supplier_stock'] = value
                    field_mapping['stock'] = value
        
        # Essential fields list
        essential_fields = ['supplier_name', 'brand', 'product_name', 'ean', 'mpn', 'cost', 'supplier_stock']
        
        # Auto-detect columns if no mapping provided
        if not field_mapping:
            print("📝 No field mapping provided, attempting to auto-detect")
            # Try to detect columns and create mapping
            columns = df.columns.tolist()
            for col in columns:
                col_lower = col.lower()
                # Only detect these specific fields
                if 'supplier' in col_lower and ('name' in col_lower):
                    field_mapping['supplier_name'] = col
                    print(f"  ✓ Mapped 'supplier_name' to '{col}'")
                elif 'product' in col_lower and ('name' in col_lower or 'title' in col_lower):
                    field_mapping['product_name'] = col
                    print(f"  ✓ Mapped 'product_name' to '{col}'")
                elif 'brand' in col_lower:
                    field_mapping['brand'] = col
                    print(f"  ✓ Mapped 'brand' to '{col}'")
                elif 'ean' in col_lower or 'barcode' in col_lower:
                    field_mapping['ean'] = col
                    print(f"  ✓ Mapped 'ean' to '{col}'")
                elif 'mpn' in col_lower or 'manufacturer' in col_lower and 'part' in col_lower:
                    field_mapping['mpn'] = col
                    print(f"  ✓ Mapped 'mpn' to '{col}'")
                elif ('cost' in col_lower or 'price' in col_lower) and 'supplier' in col_lower:
                    field_mapping['cost'] = col
                    field_mapping['supplier_cost'] = col
                    print(f"  ✓ Mapped 'cost' to '{col}'")
                elif 'stock' in col_lower and 'supplier' in col_lower:
                    field_mapping['stock'] = col
                    field_mapping['supplier_stock'] = col
                    print(f"  ✓ Mapped 'supplier_stock' to '{col}'")

        # Check all possible variations of required field keys (only supplier_name is required)
        required_fields_mapping = {
            'supplier_name': ['supplier_name', 'Supplier Name', 'supplier name', 'SupplierName', 'supplierName'],
        }
        
        # Check for required field mappings
        missing_fields = []
        
        for required_field, possible_keys in required_fields_mapping.items():
            # Check if any of the possible keys is in the mapping
            found = False
            mapped_value = None
            
            for key in possible_keys:
                if key in field_mapping and field_mapping[key]:
                    found = True
                    mapped_value = field_mapping[key]
                    # Store using the standard key naming
                    field_mapping[required_field] = mapped_value
                    print(f"  ✓ Found required field '{required_field}' mapped as '{key}' to '{mapped_value}'")
                    break
            
            if not found:
                missing_fields.append(required_field)
                print(f"  ✗ Missing required field: {required_field}")
        
        if missing_fields:
            error_msg = f"Missing required field mappings: {', '.join(missing_fields)}"
            print(f"❌ ERROR: {error_msg}")
            raise ValueError(error_msg)
        
        print("✅ All required fields are mapped!")
        
        # Process data using Supabase API approach
        batch_size = job.batch_size or 500
        print(f"📦 Using batch size: {batch_size}")
        
        # Always use the ORM method with Supabase
        print(f"🔄 Using Supabase API for data processing")
        job.progress = 5
        job.status_message = "Starting data processing with Supabase..."
        job.save()
        print(f"👉 Progress: 5% - Starting data import")
        
        # Use the optimized ORM method
        return process_supplier_file_with_orm(job, df, field_mapping)
    
    except Exception as e:
        # Update job with error
        job.status = 'failed'
        job.status_message = str(e)
        job.save()
        
        # Log error clearly
        print(f"❌ IMPORT ERROR: {str(e)}")
        print(traceback.format_exc())
        
        # Create import history record
        ImportHistory.objects.create(
            type='Supplier Data',
            file_name=job.file_name,
            status='Failed',
            error_message=str(e),
            created_by=job.user
        )
        
        # Re-raise for outer exception handler
        raise

def process_supplier_file_with_copy(job, df, field_mapping):
    """
    Process supplier file using PostgreSQL COPY command for massive performance gain
    Used for large files (100K+ rows)
    """
    # Verify we're using PostgreSQL before attempting COPY command
    if connection.vendor != 'postgresql':
        print("WARNING: COPY method requires PostgreSQL, falling back to ORM method")
        return process_supplier_file_with_orm(job, df, field_mapping)
        
    print("\n========== SUPPLIER IMPORT DEBUG ==========")
    print(f"Job ID: {job.id}")
    print(f"File: {job.file_name}")
    print(f"Field mapping from frontend: {field_mapping}")
    
    # Print actual column names in the DataFrame
    print(f"DataFrame columns: {list(df.columns)}")
    
    # Print sample data from first row
    if len(df) > 0:
        print(f"First row data (raw):")
        for col in df.columns:
            print(f"  {col}: '{df.iloc[0][col]}'")
    
    # Map column names from CSV to database fields (using standard keys that have been normalized)
    supplier_name_col = field_mapping.get('supplier_name', '')
    brand_col = field_mapping.get('brand', field_mapping.get('Brand', ''))
    product_name_col = field_mapping.get('product_name', field_mapping.get('Product name', field_mapping.get('Product Name', '')))
    ean_col = field_mapping.get('ean', field_mapping.get('EAN', ''))
    mpn_col = field_mapping.get('mpn', field_mapping.get('MPN', ''))
    cost_col = field_mapping.get('supplier_cost', field_mapping.get('cost', field_mapping.get('Supplier Cost', '')))
    stock_col = field_mapping.get('supplier_stock', field_mapping.get('Supplier stock', field_mapping.get('Supplier Stock', '')))
    
    print(f"Mapped columns:")
    print(f"  supplier_name_col: '{supplier_name_col}'")
    print(f"  brand_col: '{brand_col}'")
    print(f"  product_name_col: '{product_name_col}'")
    print(f"  ean_col: '{ean_col}'")
    print(f"  mpn_col: '{mpn_col}'")
    print(f"  cost_col: '{cost_col}'")
    print(f"  stock_col: '{stock_col}'")
    print("============================================\n")
    
    # These should already be validated in the parent function, but double-check
    if not supplier_name_col:
        raise ValueError("Required field mapping missing: Supplier Name is required")
    
    total_rows = len(df)
    successful_count = 0
    error_count = 0
    suppliers_added = 0
    match_stats = {
        "total_matched": 0,
        "by_method": {
            "ean": 0,
            "mpn": 0,
            "name": 0
        }
    }
    
    try:
        # Get match options from job
        match_options = job.match_options or {}
        
        # Create or get supplier first
        if len(df) == 0:
            raise ValueError("No data rows found in the file")
        
        # Get supplier name from the first row
        supplier_name = df[supplier_name_col].iloc[0]
        print(f"Using supplier name from first row: '{supplier_name}'")
        
        try:
            supplier = Supplier.objects.get(name=supplier_name)
            print(f"Using existing supplier: {supplier.name}")
        except Supplier.DoesNotExist:
            supplier = Supplier.objects.create(name=supplier_name)
            suppliers_added += 1
            print(f"Created new supplier: {supplier.name}")
        
        # Update job status
        job.progress = 5
        job.status_message = "Preparing bulk import..."
        job.save()
        
        # Connect directly to PostgreSQL for COPY command
        with connection.cursor() as cursor:
            # First check if supplier_products table has a match constraint
            cursor.execute("""
            SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE t.relname = 'supplier_products' AND n.nspname = 'public';
            """)
            constraints = cursor.fetchall()
            print(f"Supplier_products table constraints: {constraints}")
            
            # Create temporary table with simplified structure focusing on essential fields
            cursor.execute("""
            CREATE TEMP TABLE temp_supplier_products (
                id UUID PRIMARY KEY,
                supplier_id UUID NOT NULL,
                product_id UUID,
                product_name TEXT,
                brand TEXT,
                ean TEXT,
                mpn TEXT,
                supplier_stock INTEGER,
                cost DECIMAL(12,2),
                match_method TEXT,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE
            );
            """)
            
            print(f"Created temporary table for bulk import")
            
            # Use StringIO to prepare data for COPY
            output = io.StringIO()
            
            # Process each row in DataFrame
            for index, row in df.iterrows():
                try:
                    # Update progress
                    if index % max(1, min(total_rows // 10, 100)) == 0 or index == total_rows - 1:
                        progress = min(89, int(5 + (index / total_rows) * 84))  # Leave room for final steps
                        job.progress = progress
                        job.status_message = f"Processing row {index+1} of {total_rows}..."
                        job.save()
                    
                    # Get data from row using field mapping - handle essential fields
                    # CRITICAL FIX: Check if column exists in DataFrame
                    if supplier_name_col not in row.index:
                        print(f"Warning: supplier_name_col '{supplier_name_col}' not found in row {index}")
                        supplier_name = "Default Supplier"
                    else:
                        supplier_name = str(row[supplier_name_col]).strip()
                    
                    # Get product name
                    product_name = ""
                    if product_name_col and product_name_col in row.index:
                        product_name = str(row[product_name_col]).strip()
                    
                    # Get brand
                    brand = None
                    if brand_col and brand_col in row.index:
                        brand = str(row[brand_col]).strip()
                        if brand == '':
                            brand = None
                    
                    # Handle EAN - crucial field for matching
                    ean = None
                    if ean_col and ean_col in row.index:
                        ean_str = str(row[ean_col]).strip().replace(' ', '')
                        if ean_str:
                            # Apply scientific notation fix to the EAN value
                            ean = fix_scientific_notation(ean_str)
                        print(f"Row {index}: EAN = {ean}")
                            
                    # Handle MPN - another matching field
                    mpn = None
                    if mpn_col and mpn_col in row.index:
                        mpn = str(row[mpn_col]).strip()
                        if mpn == '':
                            mpn = None
                    
                    # Handle cost - ensure it's a valid decimal
                    cost = 0.0
                    if cost_col and cost_col in row.index:
                        try:
                            # Remove any currency symbols and normalize format
                            cost_str = str(row[cost_col]).strip().replace('$', '').replace('£', '').replace('€', '')
                            cost = float(cost_str)
                        except (ValueError, TypeError):
                            print(f"Error converting cost at row {index}: '{row[cost_col]}', using 0")
                    
                    # Handle supplier stock
                    supplier_stock = 0
                    if stock_col and stock_col in row.index:
                        try:
                            stock_str = str(row[stock_col]).strip()
                            supplier_stock = int(float(stock_str)) if stock_str else 0
                        except (ValueError, TypeError):
                            print(f"Error converting stock at row {index}: '{row[stock_col]}', using 0")
                    
                    # Try to match product by EAN (preferred), MPN, or name
                    product_id = None
                    match_method = 'none'
                    
                    # Only attempt matching if we have an EAN
                    if ean:
                        try:
                            product = Product.objects.filter(ean=ean).first()
                            if product:
                                product_id = product.id
                                match_method = 'ean'
                                match_stats['total_matched'] += 1
                                match_stats['by_method']['ean'] += 1
                        except Exception as match_error:
                            print(f"Error matching by EAN: {match_error}")
                    
                    # If no match by EAN and we have an MPN, try matching by MPN
                    if product_id is None and mpn:
                        try:
                            product = Product.objects.filter(mpn=mpn).first()
                            if product:
                                product_id = product.id
                                match_method = 'mpn'
                                match_stats['total_matched'] += 1
                                match_stats['by_method']['mpn'] += 1
                        except Exception as match_error:
                            print(f"Error matching by MPN: {match_error}")
                    
                    # Generate a UUID for each row
                    row_id = uuid.uuid4()
                    
                    # Prepare timestamps
                    now = timezone.now().isoformat()
                    
                    # Format data for COPY - CRITICAL: handle NULL values correctly with \N
                    row_data = [
                        str(row_id),
                        str(supplier.id),
                        str(product_id) if product_id else "\\N",  # Use \N for NULL
                        product_name or "\\N",
                        brand or "\\N",
                        ean or "\\N",
                        mpn or "\\N",
                        str(supplier_stock),
                        str(cost),
                        match_method,
                        now,
                        now
                    ]
                    
                    # Write to StringIO for COPY
                    try:
                        output.write('\t'.join(row_data).replace('\n', ' ') + '\n')
                        successful_count += 1
                    except Exception as write_error:
                        print(f"Error writing row {index} to CSV: {type(write_error).__name__}: {str(write_error)}")
                        print(f"Row data that failed: {row_data}")
                        error_count += 1
                        continue
                    
                except Exception as e:
                    # Add detailed error logging
                    error_count += 1
                    print(f"Error processing row {index}: {type(e).__name__}: {str(e)}")
                    
                    # Skip to next row after error - don't fail the entire import
                    continue
            
            # Debug the SQL operation
            print(f"Preparing to copy {successful_count} records to temp table")
            
            # Perform the COPY with extra error handling
            try:
                # Reset position for read
                output.seek(0)
                
                # Execute the copy
                cursor.copy_from(output, 'temp_supplier_products', null="\\N")
                print(f"Successfully copied data to temp table")
            except Exception as copy_error:
                print(f"Error during COPY operation: {str(copy_error)}")
                # Check if any data was written for debugging
                cursor.execute("SELECT COUNT(*) FROM temp_supplier_products;")
                temp_count = cursor.fetchone()[0]
                print(f"Temp table has {temp_count} records after error")
                
                # Continue with the successful records rather than failing completely
                if temp_count == 0:
                    raise  # Only raise if no records were copied
            
            # Update job status
            job.progress = 90
            job.status_message = "Finalizing database updates..."
            job.save()
            
            # Insert or update supplier products using the temporary table, handling errors gracefully
            try:
                # First, handle the unmatched products (product_id is NULL)
                try:
                    # Get count of unmatched products
                    cursor.execute("SELECT COUNT(*) FROM temp_supplier_products WHERE product_id IS NULL;")
                    unmatched_count = cursor.fetchone()[0]
                    print(f"Found {unmatched_count} unmatched products")
                    
                    if unmatched_count > 0:
                        # Insert unmatched records - updating any conflicts on supplier+EAN
                        cursor.execute("""
                        INSERT INTO supplier_products (
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        )
                        SELECT 
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        FROM 
                            temp_supplier_products
                        WHERE 
                            product_id IS NULL
                            AND ean IS NOT NULL
                        ON CONFLICT (supplier_id, ean) 
                        DO UPDATE SET
                            cost = EXCLUDED.cost,
                            match_method = EXCLUDED.match_method,
                            product_name = EXCLUDED.product_name,
                            mpn = EXCLUDED.mpn,
                            supplier_stock = EXCLUDED.supplier_stock,
                            brand = EXCLUDED.brand,
                            updated_at = EXCLUDED.updated_at;
                        """)
                        
                        # Also handle records with null ean but with other identifiers
                        cursor.execute("""
                        INSERT INTO supplier_products (
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        )
                        SELECT 
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        FROM 
                            temp_supplier_products
                        WHERE 
                            product_id IS NULL
                            AND (ean IS NULL OR ean = '')
                        ON CONFLICT DO NOTHING;  
                        """)
                        
                        print(f"Inserted/updated unmatched supplier products")
                except Exception as unmatched_error:
                    print(f"Error handling unmatched products: {unmatched_error}")
                    # Continue with the matched products even if unmatched failed
                
                # Then handle the matched products with the ON CONFLICT clause
                try:
                    # Get count of matched products
                    cursor.execute("SELECT COUNT(*) FROM temp_supplier_products WHERE product_id IS NOT NULL;")
                    matched_count = cursor.fetchone()[0]
                    print(f"Found {matched_count} matched products")
                    
                    if matched_count > 0:
                        cursor.execute("""
                        INSERT INTO supplier_products (
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        )
                        SELECT 
                            id, supplier_id, product_id, ean, cost, 
                            match_method, created_at, updated_at,
                            product_name, mpn, supplier_stock, brand
                        FROM 
                            temp_supplier_products
                        WHERE 
                            product_id IS NOT NULL
                        ON CONFLICT (supplier_id, product_id) 
                        DO UPDATE SET
                            ean = EXCLUDED.ean,
                            cost = EXCLUDED.cost,
                            match_method = EXCLUDED.match_method,
                            product_name = EXCLUDED.product_name,
                            mpn = EXCLUDED.mpn,
                            supplier_stock = EXCLUDED.supplier_stock,
                            brand = EXCLUDED.brand,
                            updated_at = EXCLUDED.updated_at;
                        """)
                        print(f"Inserted/updated {matched_count} matched supplier products")
                except Exception as matched_error:
                    print(f"Error handling matched products: {matched_error}")
                    # We can still count this as partial success
            except Exception as insert_error:
                print(f"Error during final INSERT operation: {str(insert_error)}")
                # Try to get more details about the error
                try:
                    cursor.execute("SELECT * FROM temp_supplier_products LIMIT 3;")
                    sample_rows = cursor.fetchall()
                    print(f"Sample rows from temp table:")
                    for row in sample_rows:
                        print(f"  {row}")
                except Exception as debug_error:
                    print(f"Error fetching sample rows: {str(debug_error)}")
    
    except Exception as e:
        print(f"Error during bulk import: {e}")
        # Pass the error up to be handled by the caller
        raise
    
    # Update job with results
    job.status = 'completed'
    job.progress = 100
    job.completed_at = timezone.now()
    job.status_message = f"Import completed: {successful_count} successful, {error_count} failed"
    job.results = {
        'total': total_rows,
        'successful': successful_count,
        'failed': error_count,
        'suppliers_added': suppliers_added,
        'match_stats': match_stats
    }
    job.save()
    
    # Create import history record
    try:
        ImportHistory.objects.create(
            type='Supplier Data',
            file_name=job.file_name,
            status='Completed',
            total_records=total_rows,
            successful_records=successful_count,
            failed_records=error_count,
            created_by=job.user
        )
    except Exception as history_error:
        # Don't fail the entire operation if history creation fails
        print(f"Warning: Failed to create import history record: {history_error}")
    
    return job

def process_supplier_file_with_orm(job, df, field_mapping):
    """
    Process supplier file using Supabase API for reliable storage
    Optimized for performance with large files (100K+ rows) using batch operations
    """
    try:
        print("\n========== SUPPLIER IMPORT WITH SUPABASE ==========")
        print(f"📊 Import Job: {job.id} - {job.file_name}")
        
        # Extract essential field mappings
        supplier_name_col = field_mapping.get('supplier_name', '')
        brand_col = field_mapping.get('brand', field_mapping.get('Brand', ''))
        product_name_col = field_mapping.get('product_name', field_mapping.get('Product name', field_mapping.get('Product Name', '')))
        ean_col = field_mapping.get('ean', field_mapping.get('EAN', ''))
        mpn_col = field_mapping.get('mpn', field_mapping.get('MPN', ''))
        cost_col = field_mapping.get('supplier_cost', field_mapping.get('cost', field_mapping.get('Supplier Cost', '')))
        stock_col = field_mapping.get('supplier_stock', field_mapping.get('Supplier stock', field_mapping.get('Supplier Stock', '')))
        
        # Log mapped columns for debugging
        print(f"📋 Using columns: supplier_name='{supplier_name_col}', product_name='{product_name_col}', ean='{ean_col}', cost='{cost_col}'")
        
        # Count rows in file
        total_rows = len(df)
        print(f"📈 Total rows to process: {total_rows}")
        
        # Use larger batch size for better performance with large files
        batch_size = job.batch_size or 1000
        print(f"📦 Batch size: {batch_size}")
        
        # Initialize counters
        successful_count = 0
        error_count = 0
        match_stats = {
            "total_matched": 0,
            "by_method": {
                "ean": 0,
                "mpn": 0,
                "name": 0
            }
        }
        suppliers_added = 0
        
        # Get Supabase client
        print(f"🔌 Connecting to Supabase...")
        supabase = get_supabase_client()
        
        job.progress = 8
        job.status_message = "Connected to database, processing supplier..."
        job.save()
        print(f"👉 Progress: 8% - Connected to Supabase")
        
        # Get or create supplier using Supabase
        if len(df) > 0:
            supplier_name = df[supplier_name_col].iloc[0] if supplier_name_col in df.columns else "Default Supplier"
            
            # Check if supplier exists
            print(f"🔍 Looking for supplier: {supplier_name}")
            supplier_result = supabase.table('suppliers').select('*').eq('name', supplier_name).execute()
            
            if supplier_result.data:
                supplier = supplier_result.data[0]
                print(f"✅ Using existing supplier: {supplier['name']}")
            else:
                # Create new supplier
                print(f"➕ Creating new supplier: {supplier_name}")
                supplier_data = {
                    'name': supplier_name,
                    'custom_attributes': {}
                }
                supplier_result = supabase.table('suppliers').insert(supplier_data).execute()
                supplier = supplier_result.data[0]
                suppliers_added += 1
                print(f"✅ Created supplier with ID: {supplier['id']}")
            
            job.progress = 10
            job.status_message = f"Processing data for supplier: {supplier_name}..."
            job.save()
            print(f"👉 Progress: 10% - Supplier resolved, beginning batch processing")
        else:
            raise ValueError("No data rows found in the file")
        
        # OPTIMIZATION: Prefetch a limited number of products for matching
        # This prevents bottlenecks with very large datasets
        ean_to_product_id = {}
        mpn_to_product_id = {}
        
        # Set a maximum number of items to prefetch to avoid performance issues
        MAX_PREFETCH_ITEMS = 30000  # Increased from 10000
        PREFETCH_BATCH_SIZE = 5000  # Increased from 1000
        
        # Only prefetch EANs if the column exists and isn't too large
        if ean_col and ean_col in df.columns:
            print(f"🔍 Sampling EANs for prefetching...")
            
            # Get unique EANs, limited to a reasonable number
            all_eans = set()
            for idx, ean_val in enumerate(df[ean_col]):
                # Only process a limited sample for large files
                if idx >= MAX_PREFETCH_ITEMS:
                    break
                    
                if ean_val and str(ean_val).strip():
                    fixed_ean = fix_scientific_notation(str(ean_val).strip())
                    if fixed_ean:
                        all_eans.add(fixed_ean)
            
            if all_eans:
                print(f"📝 Prefetching data for {len(all_eans)} EANs (sample of full dataset)")
                
                try:
                    # Split into reasonable batches
                    ean_batches = [list(all_eans)[i:i+PREFETCH_BATCH_SIZE] for i in range(0, len(all_eans), PREFETCH_BATCH_SIZE)]
                    
                    for batch_idx, ean_batch in enumerate(ean_batches):
                        # Show progress on larger prefetch operations
                        if batch_idx % 5 == 0:
                            print(f"  ↳ EAN Prefetch progress: {batch_idx * PREFETCH_BATCH_SIZE}/{len(all_eans)}")
                            
                        # Use the in filter with a list for efficient batch lookup
                        product_result = supabase.table('products').select('id,ean').in_('ean', ean_batch).execute()
                        
                        # Map EAN to product ID for fast lookup
                        for product in product_result.data:
                            if product['ean']:
                                ean_to_product_id[product['ean']] = product['id']
                    
                    print(f"✅ Found {len(ean_to_product_id)} products by EAN")
                    
                except Exception as prefetch_error:
                    print(f"⚠️ EAN prefetch encountered an error: {str(prefetch_error)}")
                    print(f"⚠️ Continuing without EAN prefetch data")
                    # Continue processing even if prefetch fails
        else:
            print(f"⏩ Skipping EAN prefetching (no EAN column mapped)")
        
        # Only prefetch MPNs if needed and the column exists
        if mpn_col and mpn_col in df.columns:
            print(f"🔍 Sampling MPNs for prefetching...")
            
            # Get a limited sample of unique MPNs
            all_mpns = set()
            for idx, mpn_val in enumerate(df[mpn_col]):
                # Only process a reasonable sample for large files
                if idx >= MAX_PREFETCH_ITEMS:
                    break
                    
                if mpn_val and str(mpn_val).strip():
                    mpn_str = str(mpn_val).strip()
                    if mpn_str:
                        all_mpns.add(mpn_str)
            
            if all_mpns:
                print(f"📝 Prefetching data for {len(all_mpns)} MPNs (sample of full dataset)")
                
                try:
                    # Split into batches for efficiency
                    mpn_batches = [list(all_mpns)[i:i+PREFETCH_BATCH_SIZE] for i in range(0, len(all_mpns), PREFETCH_BATCH_SIZE)]
                    
                    for batch_idx, mpn_batch in enumerate(mpn_batches):
                        # Show progress on larger operations
                        if batch_idx % 5 == 0:
                            print(f"  ↳ MPN Prefetch progress: {batch_idx * PREFETCH_BATCH_SIZE}/{len(all_mpns)}")
                            
                        product_result = supabase.table('products').select('id,mpn').in_('mpn', mpn_batch).execute()
                        
                        # Map MPN to product ID
                        for product in product_result.data:
                            if product['mpn']:
                                mpn_to_product_id[product['mpn']] = product['id']
                                
                    print(f"✅ Found {len(mpn_to_product_id)} products by MPN")
                    
                except Exception as prefetch_error:
                    print(f"⚠️ MPN prefetch encountered an error: {str(prefetch_error)}")
                    print(f"⚠️ Continuing without MPN prefetch data")
                    # Continue processing even if prefetch fails
        else:
            print(f"⏩ Skipping MPN prefetching (no MPN column mapped)")
        
        # Update progress to show we're moving forward
        job.progress = 15
        job.status_message = "Prefetching complete, starting data import..."
        job.save()
        
                        # OPTIMIZATION: Process in batches using bulk upsert for massive performance gain
        supplier_product_batch = []
        
        # Track already seen EANs to avoid duplicates in this batch
        seen_eans = set()
        seen_product_ids = set()
        processed_with_progress = set()  # Track which progress points we've logged
        
        print(f"🚀 Starting batch processing of {total_rows} rows...")
        
        # DEBUG: Check Supabase connection by testing a simple query
        try:
            test_result = supabase.from_('supplier_products').select('count(*)', count='exact').limit(1).execute()
            print(f"🔍 DEBUG: Supabase connection test: {test_result}")
        except Exception as conn_error:
            print(f"⚠️ DEBUG: Supabase connection test failed: {str(conn_error)}")
            print(f"⚠️ DEBUG: Error type: {type(conn_error)}")
        
        # PERFORMANCE OPTIMIZATION: Increase reporting interval for large datasets
        progress_step = max(1, min(total_rows // 40, 500))  # Less frequent updates for large files
        
        # Process each row and build batches
        for index, row in df.iterrows():
            try:
                # Update progress less frequently for better performance
                if index % progress_step == 0:
                    # Calculate progress - scale to leave room for final steps
                    progress_percent = min(15 + int((index / total_rows) * 80), 95)
                    
                    # Only update the database when progress changes significantly 
                    if progress_percent % 5 == 0 and progress_percent not in processed_with_progress:
                        job.progress = progress_percent
                        job.status_message = f"Processing row {index+1} of {total_rows}..."
                        job.save()
                        processed_with_progress.add(progress_percent)
                        print(f"👉 Progress: {progress_percent}% - Row {index+1}/{total_rows} ({(index/total_rows*100):.1f}%)")
                
                # Extract essential data with optimized code
                product_id = None
                match_method = 'none'
                
                # Get EAN with special handling - critical for matching
                ean = None
                if ean_col and ean_col in row.index:
                    ean_str = str(row[ean_col]).strip().replace(' ', '')
                    if ean_str:
                        # Apply scientific notation fix to the EAN value
                        ean = fix_scientific_notation(ean_str)
                        
                        # Use prefetched product lookup if available
                        if ean in ean_to_product_id:
                            product_id = ean_to_product_id[ean]
                            match_method = 'ean'
                            match_stats['total_matched'] += 1
                            match_stats['by_method']['ean'] += 1
                
                # Handle MPN - try matching if EAN didn't match
                mpn = None
                if not product_id and mpn_col and mpn_col in row.index:
                    mpn_str = str(row[mpn_col]).strip()
                    if mpn_str:
                        mpn = mpn_str
                        
                        # Use prefetched MPN lookup if available
                        if mpn in mpn_to_product_id:
                            product_id = mpn_to_product_id[mpn]
                            match_method = 'mpn'
                            match_stats['total_matched'] += 1
                            match_stats['by_method']['mpn'] += 1
                        
                        # If not in our prefetched data but looks like we need more lookups
                        # Do an on-demand lookup only for some percentage of MPNs
                        elif index % 100 == 0 and not mpn_to_product_id:  # Only do this occasionally
                            try:
                                product_result = supabase.table('products').select('id').eq('mpn', mpn).execute()
                                if product_result.data:
                                    product_id = product_result.data[0]['id']
                                    match_method = 'mpn'
                                    match_stats['total_matched'] += 1
                                    match_stats['by_method']['mpn'] += 1
                                    
                                    # Add to our lookup cache
                                    mpn_to_product_id[mpn] = product_id
                            except:
                                # Silently fail and continue
                                pass
                
                # Skip duplicates within the same batch - using composite keys
                composite_key = None
                if product_id:
                    composite_key = f"{supplier['id']}_{product_id}"
                    if composite_key in seen_product_ids:
                        continue
                    seen_product_ids.add(composite_key)
                elif ean:
                    composite_key = f"{supplier['id']}_{ean}"
                    if composite_key in seen_eans:
                        continue
                    seen_eans.add(composite_key)
                
                # Extract remaining data fields
                brand = None
                if brand_col and brand_col in row.index:
                    brand_str = str(row[brand_col]).strip()
                    if brand_str:
                        brand = brand_str
                
                product_name = ""
                if product_name_col and product_name_col in row.index:
                    product_name = str(row[product_name_col]).strip()
                
                # Handle cost - ensure it's a valid decimal
                cost = 0.0
                if cost_col and cost_col in row.index:
                    try:
                        cost_str = str(row[cost_col]).strip().replace('$', '').replace('£', '').replace('€', '')
                        cost = float(cost_str)
                    except (ValueError, TypeError):
                        cost = 0.0
                
                # Handle supplier stock
                supplier_stock = 0
                if stock_col and stock_col in row.index:
                    try:
                        stock_str = str(row[stock_col]).strip()
                        supplier_stock = int(float(stock_str)) if stock_str else 0
                    except (ValueError, TypeError):
                        supplier_stock = 0
                
                # Create supplier product object for batch insert
                supplier_product_data = {
                    'id': str(uuid.uuid4()),
                    'supplier_id': supplier['id'],
                    'product_id': product_id,
                    'product_name': product_name,
                    'ean': ean,
                    'mpn': mpn,
                    'cost': cost,
                    'supplier_stock': supplier_stock,
                    'match_method': match_method,
                    'brand': brand,
                    'created_at': timezone.now().isoformat(),
                    'updated_at': timezone.now().isoformat()
                }
                
                # Sanitize the data for JSON compatibility
                supplier_product_data = sanitize_json_object(supplier_product_data)
                supplier_product_batch.append(supplier_product_data)
                
                # OPTIMIZATION: Process in larger batches for better performance
                if len(supplier_product_batch) >= batch_size or index == total_rows - 1:
                    if supplier_product_batch:
                        # DEBUG: Print sample of the batch data to verify structure
                        print(f"🔍 DEBUG: Batch contains {len(supplier_product_batch)} records")
                        if supplier_product_batch:
                            sample = supplier_product_batch[0]
                            print(f"🔍 DEBUG: Sample record: supplier_id={sample['supplier_id']}, ean={sample['ean']}, product_name={sample['product_name']}")
                        
                        try:
                            # Use batch upsert operation instead of individual RPC calls
                            print(f"📤 Sending batch of {len(supplier_product_batch)} records to Supabase")
                            
                            # First attempt - try without specifying the conflict field
                            try:
                                # Log the exact API call we're about to make
                                print(f"🔍 DEBUG: Attempting upsert with table('supplier_products').upsert() method")
                                
                                # Attempt with just the primary key (id) as the conflict target
                                result = supabase.table('supplier_products').upsert(
                                    supplier_product_batch
                                ).execute()
                                
                                # Log the complete response for debugging
                                print(f"🔍 DEBUG: Upsert API response: {result}")
                                print(f"🔍 DEBUG: Response data type: {type(result)}")
                                print(f"🔍 DEBUG: Response has data attribute: {'data' in dir(result)}")
                                if hasattr(result, 'data'):
                                    print(f"🔍 DEBUG: Response data: {result.data}")
                                    print(f"🔍 DEBUG: Response data type: {type(result.data)}")
                                
                                # Only count records that were actually inserted/updated
                                if result.data:
                                    successful_count += len(result.data)
                                    print(f"✅ Bulk upsert complete: {len(result.data)} records processed")
                                else:
                                    print(f"⚠️ Bulk upsert returned no data, possible issue with insertion")
                                    print(f"Response: {result}")
                                    print(f"⚠️ DEBUG: Full response attributes: {dir(result)}")
                                    if hasattr(result, 'error'):
                                        print(f"⚠️ DEBUG: Error details: {result.error}")
                                    raise Exception("Supabase upsert operation returned no data")
                            except Exception as pk_error:
                                print(f"⚠️ DEBUG: Exception type: {type(pk_error)}")
                                print(f"⚠️ DEBUG: Exception details: {str(pk_error)}")
                                print(f"⚠️ DEBUG: Full traceback:")
                                import traceback
                                traceback.print_exc()
                                print(f"⚠️ Primary key upsert failed: {str(pk_error)}")
                                
                                print(f"🔄 Using optimized bulk insert strategy instead")
                                
                                # Try optimized bulk insert without constraint conflicts
                                # Split into smaller chunks for better error handling
                                CHUNK_SIZE = 50
                                chunks = [supplier_product_batch[i:i+CHUNK_SIZE] for i in range(0, len(supplier_product_batch), CHUNK_SIZE)]
                                
                                inserted_count = 0
                                failed_count = 0
                                
                                for chunk_index, chunk in enumerate(chunks):
                                    print(f"  Processing chunk {chunk_index+1}/{len(chunks)} ({len(chunk)} records)")
                                    try:
                                        # First check for existing supplier_id+ean combinations to avoid constraint violation
                                        # We need to handle these differently - collect EANs from this chunk
                                        chunk_eans = []
                                        for product in chunk:
                                            if product['ean']:
                                                chunk_eans.append(product['ean'])
                                        
                                        # Get existing records for these EANs with this supplier
                                        existing_records = {}
                                        if chunk_eans:
                                            try:
                                                result = supabase.table('supplier_products')\
                                                    .select('id,ean')\
                                                    .eq('supplier_id', supplier['id'])\
                                                    .in_('ean', chunk_eans)\
                                                    .execute()
                                                
                                                # Build a lookup dictionary of existing EANs
                                                if result.data:
                                                    for record in result.data:
                                                        if record['ean']:
                                                            existing_records[record['ean']] = record['id']
                                                    
                                                    print(f"    Found {len(existing_records)} existing records to update")
                                            except Exception as lookup_error:
                                                print(f"    Warning: Lookup of existing records failed: {str(lookup_error)}")
                                        
                                        # Split the batch into update and insert operations
                                        records_to_update = []
                                        records_to_insert = []
                                        
                                        for product in chunk:
                                            # If this EAN exists for this supplier, add to update list
                                            if product['ean'] and product['ean'] in existing_records:
                                                # Use the existing ID for update
                                                product['id'] = existing_records[product['ean']]
                                                records_to_update.append(product)
                                            else:
                                                # Generate a new UUID for insert
                                                product['id'] = str(uuid.uuid4())
                                                records_to_insert.append(product)
                                        
                                        # Perform updates first (these won't violate the constraint)
                                        if records_to_update:
                                            try:
                                                update_result = supabase.table('supplier_products').upsert(
                                                    records_to_update
                                                ).execute()
                                                
                                                # Only count successful updates confirmed by response data
                                                if update_result.data:
                                                    inserted_count += len(update_result.data)
                                                    print(f"    ✓ Updated {len(update_result.data)} existing records")
                                                else:
                                                    print(f"    ⚠️ Update returned no data, possible issue with operation")
                                                    print(f"    Response details: {update_result}")
                                            except Exception as update_error:
                                                print(f"    ⚠️ Bulk update failed: {str(update_error)}")
                                                # Fall back to individual updates
                                                individual_update_success = 0
                                                for product in records_to_update:
                                                    try:
                                                        supabase.table('supplier_products').update(product).eq('id', product['id']).execute()
                                                        individual_update_success += 1
                                                    except:
                                                        failed_count += 1
                                                
                                                inserted_count += individual_update_success
                                                print(f"    ✓ Individually updated {individual_update_success} existing records")
                                        
                                        # Now try inserting new records
                                        if records_to_insert:
                                            try:
                                                insert_result = supabase.table('supplier_products').insert(
                                                    records_to_insert
                                                ).execute()
                                                
                                                # Count successful inserts
                                                if insert_result.data:
                                                    inserted_count += len(insert_result.data)
                                                    print(f"    ✓ Inserted {len(insert_result.data)} new records")
                                                else:
                                                    print(f"    ⚠️ Insert returned no data, possible issue with operation")
                                                    print(f"    Response details: {insert_result}")
                                            except Exception as insert_error:
                                                print(f"    ⚠️ Bulk insert failed: {str(insert_error)}")
                                                # Fall back to individual inserts
                                                individual_insert_success = 0
                                                for product in records_to_insert:
                                                    try:
                                                        supabase.table('supplier_products').insert([product]).execute()
                                                        individual_insert_success += 1
                                                    except:
                                                        failed_count += 1
                                                
                                                inserted_count += individual_insert_success
                                                print(f"    ✓ Individually inserted {individual_insert_success} new records")
                                    except Exception as chunk_error:
                                        print(f"  ⚠️ Chunk processing failed: {str(chunk_error)}")
                                        # Fall back to individual RPC processing for this chunk
                                        print(f"  ↳ Falling back to RPC for individual processing")
                                        for product in chunk:
                                            try:
                                                result = supabase.rpc('safely_upsert_supplier_product', {
                                                    'p_supplier_id': product['supplier_id'],
                                                    'p_product_id': product['product_id'],
                                                    'p_product_name': product['product_name'],
                                                    'p_ean': product['ean'],
                                                    'p_mpn': product['mpn'],
                                                    'p_cost': product['cost'],
                                                    'p_supplier_stock': product['supplier_stock'],
                                                    'p_match_method': product['match_method'],
                                                    'p_brand': product['brand']
                                                }).execute()
                                                # Only increment if successful
                                                if result.data:
                                                    inserted_count += 1
                                            except:
                                                failed_count += 1
                            
                            # Clear batch and seen trackers after successful batch
                            supplier_product_batch = []
                            seen_eans.clear()
                            seen_product_ids.clear()
                            
                        except Exception as batch_error:
                            print(f"❌ Bulk operation error: {str(batch_error)}")
                            
                            # Fallback to handling records individually using RPC
                            print(f"🔄 Falling back to individual RPC processing for {len(supplier_product_batch)} records")
                            fallback_success = 0
                            fallback_error = 0
                            
                            for product in supplier_product_batch:
                                try:
                                    # Use RPC call to safely_upsert_supplier_product function
                                    result = supabase.rpc('safely_upsert_supplier_product', {
                                        'p_supplier_id': product['supplier_id'],
                                        'p_product_id': product['product_id'],
                                        'p_product_name': product['product_name'],
                                        'p_ean': product['ean'],
                                        'p_mpn': product['mpn'],
                                        'p_cost': product['cost'],
                                        'p_supplier_stock': product['supplier_stock'],
                                        'p_match_method': product['match_method'],
                                        'p_brand': product['brand']
                                    }).execute()
                                    # Only count successful operations with actual data returned
                                    if result.data:
                                        fallback_success += 1
                                    else:
                                        print(f"  ⚠️ RPC call didn't return data: {result}")
                                        fallback_error += 1
                                except Exception as item_error:
                                    fallback_error += 1
                            
                            # Update counters
                            successful_count += fallback_success
                            error_count += fallback_error
                            print(f"✅ Fallback complete: {fallback_success} succeeded, {fallback_error} failed")
                            
                            # Clear batch and seen trackers
                            supplier_product_batch = []
                            seen_eans.clear()
                            seen_product_ids.clear()
                            
                    # Update job with current progress
                    job.status_message = f"Processed {successful_count} records so far..."
                    job.save()
            except Exception as e:
                # Add to error count but continue processing
                error_count += 1
                continue
        
        # Update job with results
        job.status = 'completed'
        job.progress = 100
        job.completed_at = timezone.now()
        job.results = {
            'total': total_rows,
            'successful': successful_count,
            'failed': error_count,
            'suppliers_added': suppliers_added,
            'match_stats': match_stats
        }
        job.status_message = f"Import completed: {successful_count} successful, {error_count} failed"
        job.save()
        print(f"👉 Progress: 100% - Import completed")
        
        # Create import history record
        ImportHistory.objects.create(
            type='Supplier Data',
            file_name=job.file_name,
            status='Completed',
            total_records=total_rows,
            successful_records=successful_count,
            failed_records=error_count,
            created_by=job.user
        )
        
        # DEBUG: Verify data was actually stored by querying the database
        try:
            # Query Supabase to confirm records were inserted
            supplier_id = supplier['id']
            verify_result = supabase.table('supplier_products').select('count(*)', count='exact').eq('supplier_id', supplier_id).execute()
            actual_count = verify_result.count if hasattr(verify_result, 'count') else 0
            
            print(f"🔍 DEBUG: VERIFICATION - Records found in database for supplier {supplier_id}: {actual_count}")
            print(f"🔍 DEBUG: VERIFICATION - Expected successful records: {successful_count}")
            
            if actual_count == 0 and successful_count > 0:
                print(f"⚠️ DEBUG: CRITICAL ERROR - Records were reported as successful but not found in database!")
            elif actual_count > 0 and successful_count == 0:
                print(f"⚠️ DEBUG: UNUSUAL CONDITION - Records found in database but none reported as successful!")
        except Exception as verify_error:
            print(f"⚠️ DEBUG: Verification failed: {str(verify_error)}")
        
        print(f"=== SUPPLIER IMPORT COMPLETED ===")
        print(f"📊 Total: {total_rows}, Successful: {successful_count}, Failed: {error_count}")
        print(f"🔍 Match Stats: {match_stats}")
        
    except Exception as e:
        # Update job with error
        job.status = 'failed'
        job.status_message = str(e)
        job.save()
        
        # Log detailed error
        print(f"❌ IMPORT FAILED: {str(e)}")
        print(traceback.format_exc())
        
        # Create import history record
        ImportHistory.objects.create(
            type='Supplier Data',
            file_name=job.file_name,
            status='Failed',
            error_message=str(e),
            created_by=job.user
        )
        
        # Re-raise for outer exception handler
        raise
        
    return job

def process_product_file(job):
    """
    Process an Amazon product data file - optimized for large files
    """
    print(f"=== Starting product file processing for job {job.id} ===")
    print(f"File: {job.file_name} ({job.file_size} bytes)")
    print(f"Status: {job.status}")
    
    # Initialize batch collection for Supabase
    products_batch = []
    # Use larger batch size for better performance with big files
    batch_size = 100  
    
    # Determine file type and read data
    try:
        # Verify the file exists
        if not os.path.exists(job.file_path):
            error_msg = f"File does not exist at path: {job.file_path}"
            print(error_msg)
            job.status = 'failed'
            job.status_message = error_msg
            job.save()
            return
            
        print(f"Reading file: {job.file_path}")
        
        # Attempt to read the file - use dtype=str to avoid auto-conversion issues
        if job.file_path.endswith('.csv'):
            print("Parsing CSV file")
            try:
                # Use string type for all columns to avoid auto-conversion issues
                df = pd.read_csv(job.file_path, dtype=str, keep_default_na=False, encoding='utf-8-sig')
            except Exception as e:
                error_msg = f"Error reading CSV file: {str(e)}"
                print(error_msg)
                raise ValueError(error_msg)
        elif job.file_path.endswith(('.xlsx', '.xls')):
            print("Parsing Excel file")
            try:
                # Use string type for all columns to avoid auto-conversion issues
                df = pd.read_excel(job.file_path, dtype=str, keep_default_na=False)
            except Exception as e:
                error_msg = f"Error reading Excel file: {str(e)}"
                print(error_msg)
                raise ValueError(error_msg)
        else:
            error_msg = f"Unsupported file format: {job.file_path}"
            print(error_msg)
            raise ValueError(error_msg)
        
        # Log basic info about the dataframe
        print(f"File read successfully. Total rows: {len(df)}")
        print(f"Columns found: {df.columns.tolist()}")
        
        # Get total rows for progress tracking
        total_rows = len(df)
        job.total_rows = total_rows
        job.save()
        
        # Get field mapping
        field_mapping = job.field_mapping or {}
        print(f"Using field mapping: {field_mapping}")
        
        # Default mapping if not provided
        if not field_mapping:
            print("No field mapping provided, attempting to auto-detect")
            # Use utility function to auto-map fields
            columns = df.columns.tolist()
            field_mapping = auto_map_amazon_fields(columns)
            print(f"Auto-mapped fields: {field_mapping}")
        
        # Ensure required fields are mapped
        required_fields = ['title', 'ean', 'brand', 'sale_price']
        missing_fields = [field for field in required_fields if field not in field_mapping]
        
        if missing_fields:
            error_msg = f"Missing required field mappings: {', '.join(missing_fields)}"
            print(error_msg)
            print(f"Available columns: {df.columns.tolist()}")
            print(f"Current mapping: {field_mapping}")
            raise ValueError(error_msg)
        
        print("All required fields are mapped!")
        
        # Process data in batches
        batch_size = job.batch_size or 100
        print(f"Using batch size: {batch_size}")
        
        successful_count = 0
        error_count = 0
        skipped_count = 0
        
        # Set up Supabase client once outside the loop
        supabase = get_supabase_client()
        
        # Track already seen EANs to avoid duplicates in this batch
        seen_eans = set()
        
        # Process each row
        for index, row in df.iterrows():
            try:
                # Update progress every 10% or 100 rows, whichever is less frequent
                update_frequency = max(1, min(total_rows // 10, 100))
                if index % update_frequency == 0 or index == total_rows - 1:
                    progress = int((index / total_rows) * 100)
                    if progress != job.progress:
                        job.progress = progress
                        job.save()
                        print(f"Progress: {progress}% ({index+1}/{total_rows})")
                
                # Extract fields for this row - ensure all values are properly handled
                title = str(row[field_mapping['title']]).strip() if row[field_mapping['title']] else "Untitled Product"
                
                # Handle EAN code with extra care
                ean_raw = str(row[field_mapping['ean']]).strip() if row[field_mapping['ean']] else ""
                
                # Apply fix for scientific notation on EAN values
                ean = fix_scientific_notation(ean_raw)
                
                # Skip rows with missing or already seen EANs to avoid constraint violations
                if not ean or ean.lower() == 'nan' or ean.lower() == 'none' or ean in seen_eans:
                    skipped_count += 1
                    if index < 10 or index % 1000 == 0:  # Log first few skips and periodic samples
                        print(f"Row {index}: Skipping product with invalid or duplicate EAN: '{ean_raw}', current skipped count: {skipped_count}")
                    continue
                
                # Remember this EAN to prevent duplicates in the same batch
                seen_eans.add(ean)
                if index < 10 or index % 1000 == 0 or index == total_rows - 1:  # Log periodically
                    print(f"Row {index}: Added EAN '{ean}' to tracking set")
                
                # Get brand with default
                brand = str(row[field_mapping['brand']]).strip() if row[field_mapping['brand']] else "Unknown Brand"
                
                # Handle numeric fields carefully
                try:
                    sale_price_str = str(row[field_mapping['sale_price']]).strip()
                    # Remove currency symbols
                    sale_price_str = sale_price_str.replace('$', '').replace('£', '').replace('€', '')
                    sale_price = float(sale_price_str) if sale_price_str else 0.0
                except (ValueError, TypeError):
                    print(f"Warning: Could not convert sale_price at row {index}: {row[field_mapping['sale_price']]}")
                    sale_price = 0.0
                
                # Get optional fields
                mpn = str(row[field_mapping.get('mpn', '')]).strip() if field_mapping.get('mpn') in row and row[field_mapping.get('mpn')] else None
                
                # Handle numeric fields with defensive coding
                units_sold = 0
                if field_mapping.get('units_sold') in row:
                    try:
                        units_sold_str = str(row[field_mapping.get('units_sold')]).strip()
                        units_sold = int(float(units_sold_str)) if units_sold_str else 0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert units_sold to int at row {index}")
                
                amazon_fee = 0.0
                if field_mapping.get('amazon_fee') in row:
                    try:
                        amazon_fee_str = str(row[field_mapping.get('amazon_fee')]).strip().replace('$', '').replace('£', '').replace('€', '')
                        amazon_fee = float(amazon_fee_str) if amazon_fee_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert amazon_fee to float at row {index}")
                
                buy_box_price = 0.0
                if field_mapping.get('buy_box_price') in row:
                    try:
                        buy_box_price_str = str(row[field_mapping.get('buy_box_price')]).strip().replace('$', '').replace('£', '').replace('€', '')
                        buy_box_price = float(buy_box_price_str) if buy_box_price_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert buy_box_price to float at row {index}")
                
                category = str(row[field_mapping.get('category', '')]).strip() if field_mapping.get('category') in row and row[field_mapping.get('category')] else None
                
                rating = None
                if field_mapping.get('rating') in row:
                    try:
                        rating_str = str(row[field_mapping.get('rating')]).strip()
                        rating = float(rating_str) if rating_str else None
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert rating to float at row {index}")
                
                review_count = 0
                if field_mapping.get('review_count') in row:
                    try:
                        review_count_str = str(row[field_mapping.get('review_count')]).strip()
                        review_count = int(float(review_count_str)) if review_count_str else 0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert review_count to int at row {index}")
                
                # Process new fields
                asin = str(row[field_mapping.get('asin', '')]).strip() if field_mapping.get('asin') in row and row[field_mapping.get('asin')] else None
                upc = str(row[field_mapping.get('upc', '')]).strip() if field_mapping.get('upc') in row and row[field_mapping.get('upc')] else None
                buy_box_seller_name = str(row[field_mapping.get('buy_box_seller_name', '')]).strip() if field_mapping.get('buy_box_seller_name') in row and row[field_mapping.get('buy_box_seller_name')] else None
                
                # Handle new numeric fields
                fba_fees = 0.0
                if field_mapping.get('fba_fees') in row:
                    try:
                        fba_fees_str = str(row[field_mapping.get('fba_fees')]).strip().replace('$', '').replace('£', '').replace('€', '')
                        fba_fees = float(fba_fees_str) if fba_fees_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert fba_fees to float at row {index}")
                
                referral_fee = 0.0
                if field_mapping.get('referral_fee') in row:
                    try:
                        referral_fee_str = str(row[field_mapping.get('referral_fee')]).strip().replace('$', '').replace('£', '').replace('€', '')
                        referral_fee = float(referral_fee_str) if referral_fee_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert referral_fee to float at row {index}")
                
                bought_past_month = 0
                if field_mapping.get('bought_past_month') in row:
                    try:
                        bought_past_month_str = str(row[field_mapping.get('bought_past_month')]).strip()
                        bought_past_month = int(float(bought_past_month_str)) if bought_past_month_str else 0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert bought_past_month to int at row {index}")
                
                estimated_monthly_revenue = 0.0
                if field_mapping.get('estimated_monthly_revenue') in row:
                    try:
                        estimated_monthly_revenue_str = str(row[field_mapping.get('estimated_monthly_revenue')]).strip().replace('$', '').replace('£', '').replace('€', '')
                        estimated_monthly_revenue = float(estimated_monthly_revenue_str) if estimated_monthly_revenue_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert estimated_monthly_revenue to float at row {index}")
                
                fba_sellers = 0
                if field_mapping.get('fba_sellers') in row:
                    try:
                        fba_sellers_str = str(row[field_mapping.get('fba_sellers')]).strip()
                        fba_sellers = int(float(fba_sellers_str)) if fba_sellers_str else 0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert fba_sellers to int at row {index}")
                
                amazon_instock_rate = 0.0
                if field_mapping.get('amazon_instock_rate') in row:
                    try:
                        amazon_instock_rate_str = str(row[field_mapping.get('amazon_instock_rate')]).strip().replace('%', '')
                        amazon_instock_rate = float(amazon_instock_rate_str) if amazon_instock_rate_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert amazon_instock_rate to float at row {index}")
                
                dominant_seller_percentage = 0.0
                if field_mapping.get('dominant_seller_percentage') in row:
                    try:
                        dominant_seller_percentage_str = str(row[field_mapping.get('dominant_seller_percentage')]).strip().replace('%', '')
                        dominant_seller_percentage = float(dominant_seller_percentage_str) if dominant_seller_percentage_str else 0.0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert dominant_seller_percentage to float at row {index}")
                
                live_offers_count = 0
                if field_mapping.get('live_offers_count') in row:
                    try:
                        live_offers_count_str = str(row[field_mapping.get('live_offers_count')]).strip()
                        live_offers_count = int(float(live_offers_count_str)) if live_offers_count_str else 0
                    except (ValueError, TypeError):
                        print(f"Warning: Could not convert live_offers_count to int at row {index}")
                
                # Create product instance with UUID
                product_id = uuid.uuid4()
                    
                    # Create product object for batch saving
                product_data = {
                        'id': str(product_id),
                        'title': title,
                        'ean': ean,
                        'mpn': mpn,
                        'brand': brand,
                        'sale_price': float(sale_price),
                        'units_sold': int(units_sold),
                        'amazon_fee': float(amazon_fee),
                        'buy_box_price': float(buy_box_price),
                        'category': category,
                        'rating': float(rating) if rating is not None else None,
                        'review_count': int(review_count),
                        'asin': asin,
                        'upc': upc,
                        'fba_fees': float(fba_fees),
                        'referral_fee': float(referral_fee),
                        'bought_past_month': int(bought_past_month),
                        'estimated_monthly_revenue': float(estimated_monthly_revenue),
                        'fba_sellers': int(fba_sellers),
                        'amazon_instock_rate': float(amazon_instock_rate),
                        'dominant_seller_percentage': float(dominant_seller_percentage),
                        'buy_box_seller_name': buy_box_seller_name,
                    'live_offers_count': int(live_offers_count),
                    'created_at': timezone.now().isoformat(),
                    'updated_at': timezone.now().isoformat()
                    }
                    
                # Sanitize the product data to ensure JSON compliance
                product_data = sanitize_json_object(product_data)
                
                # Add to batch for Supabase operations
                products_batch.append(product_data)
                    
                # Save batch of products to Supabase when batch size is reached
                if len(products_batch) >= batch_size:
                    try:
                        # Save to Supabase - use ON CONFLICT DO UPDATE strategy for existing EANs
                        response = supabase.table('products').upsert(
                            products_batch, 
                            on_conflict='ean'
                        ).execute()
                        
                        # Clear batch and update counters
                        successful_count += len(products_batch)
                        print(f"Batch saved successfully: {len(products_batch)} products")
                        products_batch = []
                        seen_eans.clear()  # Reset the seen EANs after a successful batch
                        
                    except Exception as e:
                        print(f"Error batch saving to Supabase: {str(e)}")
                        
                        # Try to save products one by one as a fallback
                        print("Attempting to save records individually as fallback...")
                        fallback_success = 0
                        fallback_error = 0
                        
                        for product in products_batch:
                            try:
                                # Ensure each product is properly sanitized 
                                sanitized_product = sanitize_json_object(product)
                                
                                # Try to upsert with 'ON CONFLICT' on the EAN
                                supabase.table('products').upsert(
                                    [sanitized_product],
                                    on_conflict='ean'
                                ).execute()
                                
                                fallback_success += 1
                            except Exception as single_error:
                                print(f"Error saving single product: {str(single_error)}")
                                fallback_error += 1
                        
                        # Update counters
                        successful_count += fallback_success
                        error_count += fallback_error
                        print(f"✅ Fallback complete: {fallback_success} succeeded, {fallback_error} failed")
                        
                        # Clear batch regardless of errors
                        products_batch = []
                        seen_eans.clear()  # Reset the seen EANs after the fallback
                    
            except Exception as e:
                # Log general row processing error
                error_count += 1
                if error_count < 10:  # Only show first few errors in detail
                    print(f"Error processing row {index}: {str(e)}")
                elif error_count == 10:
                    print("Additional errors will be counted but not shown in detail")
        
        # Process any remaining products in the final batch
        if products_batch:
            try:
                # Save to Supabase - use ON CONFLICT DO UPDATE strategy for existing EANs
                response = supabase.table('products').upsert(
                    products_batch, 
                    on_conflict='ean'
                ).execute()
                
                # Update counters
                successful_count += len(products_batch)
                print(f"Final batch saved successfully: {len(products_batch)} products")
                
            except Exception as e:
                print(f"Error saving final batch to Supabase: {str(e)}")
                
                # Try to save products one by one as a fallback
                fallback_success = 0
                fallback_error = 0
                
                print("Attempting individual product saves for final batch...")
                for product in products_batch:
                    try:
                        # Ensure each product is properly sanitized
                        sanitized_product = sanitize_json_object(product)
                        
                        # Try to upsert with 'ON CONFLICT' on the EAN
                        supabase.table('products').upsert(
                            [sanitized_product],
                            on_conflict='ean'
                        ).execute()
                        
                        fallback_success += 1
                    except Exception as single_error:
                        print(f"Error saving single product: {str(single_error)}")
                        fallback_error += 1
                
                # Update counters
                successful_count += fallback_success
                error_count += fallback_error
                print(f"Final batch fallback completed: {fallback_success} succeeded, {fallback_error} failed")
        
        # Update job with completion information
        print(f"[DEBUG RESULTS] Preparing to set final job results")
        print(f"[DEBUG RESULTS] Raw counts - Success: {successful_count}, Errors: {error_count}, Skipped: {skipped_count}, Total: {total_rows}")
        
        job.status = 'completed'
        job.progress = 100
        job.processed_rows = successful_count
        job.error_count = error_count
        
        # Create detailed results object
        job_results = {
            'total': total_rows,
            'successful': successful_count,
            'failed': error_count,
            'skipped': skipped_count
        }
        print(f"[DEBUG RESULTS] Setting job.results to: {job_results}")
        job.results = job_results
        
        # Set status message with full details
        status_message = f"Import completed: {successful_count} products imported, {error_count} errors, {skipped_count} skipped (invalid EANs)"
        print(f"[DEBUG RESULTS] Setting job.status_message to: '{status_message}'")
        job.status_message = status_message
        
        job.completed_at = timezone.now()
        job.save()
        
        # Verify what was actually saved to the database
        refreshed_job = ImportJob.objects.get(pk=job.id)
        print(f"[DEBUG VERIFY] Saved job.progress = {refreshed_job.progress}")
        print(f"[DEBUG VERIFY] Saved job.results = {refreshed_job.results}")
        print(f"[DEBUG VERIFY] Saved job.status_message = '{refreshed_job.status_message}'")
        
        # Log completion
        print(f"=== Product import completed ===")
        print(f"Successful: {successful_count}, Errors: {error_count}, Skipped: {skipped_count}")
        print(f"Total rows processed: {total_rows}")
        
        # Create import history entry
        ImportHistory.objects.create(
            type=job.type,
            file_name=job.file_name,
            file_size=job.file_size,
            status='completed',
            total_records=total_rows,
            successful_records=successful_count,
            failed_records=error_count,
            started_at=job.started_at,
            completed_at=job.completed_at
        )
        
    except Exception as e:
        # Update job with error
        job.status = 'failed'
        job.status_message = str(e)
        job.save()
        
        print(f"=== Import failed ===")
        print(f"Error: {str(e)}")
        print(traceback.format_exc())
        
        # Create import history record
        ImportHistory.objects.create(
            type=job.type,
            file_name=job.file_name,
            file_size=job.file_size,
            status='failed',
            error_message=str(e),
            created_by=job.user
        )
        
        # Re-raise for outer exception handler
        raise 