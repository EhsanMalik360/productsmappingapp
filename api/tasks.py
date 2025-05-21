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
        skipped_count = 0  # Track skipped records
        deduped_count = 0  # Track deduplicated records
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
        
        # Track detailed information about duplicates
        duplicate_details = []
        
        print(f"🚀 Starting batch processing of {total_rows} rows...")
        
        # Verify Supabase connection
        try:
            supabase.table('supplier_products').select('id', count='exact').limit(1).execute()
        except Exception as conn_error:
            print(f"⚠️ Error connecting to Supabase: {str(conn_error)}")
        
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
                is_duplicate = False
                duplicate_reason = ""
                
                # First check if we have at least one identifier
                has_identifier = product_id or ean or mpn
                
                if not has_identifier:
                    # Use product name as a fallback identifier if available
                    product_name = ""
                    if product_name_col and product_name_col in row.index:
                        product_name = str(row[product_name_col]).strip()
                    
                    if product_name:
                        composite_key = f"{supplier['id']}_{product_name}"
                        if composite_key in seen_eans:  # Using seen_eans set for these as well
                            is_duplicate = True
                            duplicate_reason = f"Duplicate product name: '{product_name}'"
                        else:
                            seen_eans.add(composite_key)
                elif product_id:
                    composite_key = f"{supplier['id']}_{product_id}"
                    if composite_key in seen_product_ids:
                        is_duplicate = True
                        duplicate_reason = f"Duplicate product ID: '{product_id}'"
                    else:
                        seen_product_ids.add(composite_key)
                elif ean:
                    composite_key = f"{supplier['id']}_{ean}"
                    if composite_key in seen_eans:
                        is_duplicate = True
                        duplicate_reason = f"Duplicate EAN: '{ean}'"
                    else:
                        seen_eans.add(composite_key)
                elif mpn:
                    # Add MPN as another identifier option
                    composite_key = f"{supplier['id']}_{mpn}"
                    if composite_key in seen_product_ids:
                        is_duplicate = True
                        duplicate_reason = f"Duplicate MPN: '{mpn}'"
                    else:
                        seen_product_ids.add(composite_key)
                
                if is_duplicate:
                    deduped_count += 1
                    # Extract row data for duplicate tracking
                    row_data = {}
                    for col in row.index:
                        row_data[col] = str(row[col])
                    
                    # Store detailed info about the duplicate
                    duplicate_details.append({
                        'row_index': index + 1,  # 1-based index for user-friendly display
                        'reason': duplicate_reason,
                        'data': row_data
                    })
                    
                    # Log duplicates with more detail
                    print(f"Row {index+1}: Skipping duplicate - {duplicate_reason}")
                    continue
                
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
                
                # Log occasional progress for monitoring
                if index % 100 == 0:
                    print(f"📊 Processing record {index}/{total_rows}, batch size: {len(supplier_product_batch)}")
                
                # OPTIMIZATION: Process in larger batches for better performance
                is_last_row = (index == total_rows - 1)
                is_batch_full = (len(supplier_product_batch) >= batch_size)
                
                if is_batch_full or is_last_row:
                    if supplier_product_batch:
                        # Log batch processing
                        print(f"📤 Processing batch of {len(supplier_product_batch)} records")
                        
                        try:
                            # Use batch upsert operation instead of individual RPC calls
                            print(f"📤 Sending batch of {len(supplier_product_batch)} records to Supabase")
                            
                            # Attempt upsert operation
                            try:
                                # Attempt database upsert
                                result = supabase.table('supplier_products').upsert(
                                    supplier_product_batch
                                ).execute()
                                
                                # Count successful records
                                if result.data:
                                    successful_count += len(result.data)
                                    print(f"✅ Bulk upsert complete: {len(result.data)} records processed")
                                else:
                                    print(f"⚠️ Bulk upsert returned no data, possible issue with insertion")
                                    raise Exception("Supabase upsert operation returned no data")
                            except Exception as pk_error:
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
                                                    successful_count += len(update_result.data)  # CRITICAL FIX: Update the master counter
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
                                                successful_count += individual_update_success  # CRITICAL FIX: Update the master counter
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
                                                    successful_count += len(insert_result.data)  # CRITICAL FIX: Update the master counter
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
                                                successful_count += individual_insert_success  # CRITICAL FIX: Update the master counter
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
                            successful_count += fallback_success  # ENSURE we always increment the main counter
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
        
        # Process any remaining items in the batch
        if supplier_product_batch:
            print(f"📤 Processing final batch of {len(supplier_product_batch)} records")
            
            try:
                # Use upsert for final batch
                result = supabase.table('supplier_products').upsert(
                    supplier_product_batch
                ).execute()
                
                if hasattr(result, 'data') and result.data:
                    successful_count += len(result.data)
                    print(f"✅ Final batch insertion completed: {len(result.data)} records processed")
            except Exception as e:
                print(f"⚠️ Final batch insertion failed: {str(e)}")
                error_count += len(supplier_product_batch)
                
        # Update job with results
        job.status = 'completed'
        job.progress = 100
        job.completed_at = timezone.now()
        
        # Create a more detailed status message that mentions duplicates
        status_message = f"Import completed: {successful_count} successful"
        if deduped_count > 0:
            status_message += f", {deduped_count} duplicates skipped"
        if error_count > 0:
            status_message += f", {error_count} failed"
        
        job.status_message = status_message
        
        # Add duplicate details to the job results for display in the UI
        job.results = {
            'total': total_rows,
            'successful': successful_count,
            'failed': error_count,
            'skipped': skipped_count,
            'deduped': deduped_count,
            'suppliers_added': suppliers_added,
            'match_stats': match_stats,
            'duplicate_details': duplicate_details[:100]  # Limit to 100 entries to avoid excessive size
        }
        job.save()
        print(f"👉 Progress: 100% - Import completed")
        
        # Create import history record with improved status details
        status_detail = "Completed"
        if deduped_count > 0:
            status_detail += f" ({deduped_count} duplicates skipped)"
            
        ImportHistory.objects.create(
            type='Supplier Data',
            file_name=job.file_name,
            status=status_detail,
            total_records=total_rows,
            successful_records=successful_count,
            failed_records=error_count,
            created_by=job.user
        )
        
        # Verify data was actually stored - with improved accuracy
        try:
            # Query for actual record count using a more robust approach
            supplier_id = supplier['id']
            
            # Try multiple approaches to get the most accurate count
            actual_count = 0
            
            # First try with count parameter
            try:
                verify_result = supabase.table('supplier_products').select('id', count='exact').eq('supplier_id', supplier_id).execute()
                actual_count = verify_result.count if hasattr(verify_result, 'count') else 0
                print(f"✓ Database verification method 1: {actual_count} records found for supplier {supplier['name']}")
            except Exception as count_error:
                print(f"⚠️ Count method failed: {str(count_error)}")
            
            # If that fails or returns 0, try with a direct count RPC
            if actual_count == 0:
                try:
                    # Use RPC function to get count directly from database
                    count_result = supabase.rpc('get_supplier_product_count', {'supplier_id_param': supplier_id}).execute()
                    if count_result.data and isinstance(count_result.data, list) and len(count_result.data) > 0:
                        actual_count = count_result.data[0]
                        print(f"✓ Database verification method 2: {actual_count} records found for supplier {supplier['name']}")
                except Exception as rpc_error:
                    print(f"⚠️ RPC count method failed: {str(rpc_error)}")
            
            # As a last resort, fetch all IDs and count them (only for smaller datasets)
            if actual_count == 0 and (total_rows < 10000 or successful_count < 10000):
                try:
                    all_ids_result = supabase.table('supplier_products').select('id').eq('supplier_id', supplier_id).execute()
                    if all_ids_result.data:
                        actual_count = len(all_ids_result.data)
                        print(f"✓ Database verification method 3: {actual_count} records found for supplier {supplier['name']}")
                except Exception as ids_error:
                    print(f"⚠️ All IDs method failed: {str(ids_error)}")
            
            # Log final verification
            print(f"✓ Final database verification: {actual_count} records found for supplier {supplier['name']}")
            
            # Compare with what we expected
            expected_success = total_rows - deduped_count - error_count - skipped_count
            if actual_count < successful_count:
                print(f"⚠️ WARNING: Only {actual_count} records found in database, but reported {successful_count} as successful")
            elif actual_count > successful_count:
                print(f"⚠️ WARNING: Found {actual_count} records in database, but only reported {successful_count} as successful")
                
                # Use the verified count as the true success count
                successful_count = actual_count
            
            if actual_count == 0 and successful_count > 0:
                print(f"❌ CRITICAL WARNING: Records were reported as successful but not found in database!")
        except Exception as verify_error:
            print(f"⚠️ Database verification failed: {str(verify_error)}")
            print(f"⚠️ Continuing with reported counts, but they may be inaccurate")
        
        print(f"=== SUPPLIER IMPORT COMPLETED ===")
        print(f"📊 Total: {total_rows}, Successful: {successful_count}, Failed: {error_count}")
        print(f"📊 Skipped: {skipped_count}, Duplicates: {deduped_count}")
        if deduped_count > 0:
            print(f"📊 Duplicate reasons: Rows were skipped because they had the same EAN/MPN/ID for the same supplier")
            # Print the first few duplicate details
            for i, dup in enumerate(duplicate_details[:5]):  # Show at most 5 examples
                print(f"  → Row {dup['row_index']}: {dup['reason']}")
            if len(duplicate_details) > 5:
                print(f"  → ... and {len(duplicate_details) - 5} more duplicates")
        print(f"🔍 Match Stats: {match_stats}")
        
        # Add verification to confirm successful_count accuracy (before returning)
        try:
            # If database verification count exists, use that for reporting
            if 'actual_count' in locals() and actual_count > 0 and actual_count > successful_count:
                print(f"⚠️ Adjusting successful count from {successful_count} to {actual_count} based on database verification")
                job.results['successful'] = actual_count
                # Update message and save job again
                status_message = f"Import completed: {actual_count} successful"
                if deduped_count > 0:
                    status_message += f", {deduped_count} duplicates skipped"
                if error_count > 0:
                    status_message += f", {error_count} failed"
                job.status_message = status_message
                job.save()
        except Exception as verify_adjust_error:
            print(f"⚠️ Could not adjust successful count: {verify_adjust_error}")
            
        # Print final accuracy validation
        print(f"🔍 Final verification - Records in database: {actual_count if 'actual_count' in locals() else 'unknown'}, Reported successful: {job.results['successful']}")
        
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
        
        # Process data in batches - use larger batch size for better performance with big files
        batch_size = job.batch_size or 1000  # Increased from 100 for better performance with large files
        print(f"Using batch size: {batch_size} for faster processing")
        
        successful_count = 0
        error_count = 0
        skipped_count = 0
        
        # Set up Supabase client once outside the loop with optimized connection settings
        supabase = get_supabase_client()
        
        # PERFORMANCE: Large file import strategy
        if total_rows > 10000:
            print(f"🚀 Detected large import with {total_rows} rows - using high-performance mode")
            # For large files, output less frequent progress updates and use larger batches
            if not batch_size or batch_size < 1000:
                batch_size = min(5000, max(1000, total_rows // 100))  # Dynamic batch sizing based on total rows
                print(f"ℹ️ Automatically adjusted batch size to {batch_size} for optimal performance")
        
        # Track already seen EANs to avoid duplicates in this batch
        seen_eans = set()
        # Track newly imported product identifiers for matching
        # This will store the products imported in this batch for matching later
        imported_products = []
        
        # Process each row
        for index, row in df.iterrows():
            try:
                # Update progress less frequently for large datasets to improve performance
                # For datasets >10K rows, only update every 5% or 1000 rows for better performance
                if total_rows > 10000:
                    update_frequency = max(1000, total_rows // 20)  # 5% intervals for large files
                else:
                    update_frequency = max(1, min(total_rows // 10, 100))  # 10% for smaller files
                    
                if index % update_frequency == 0 or index == total_rows - 1:
                    progress = int((index / total_rows) * 100)
                    if progress != job.progress:
                        job.progress = progress
                        job.save()
                        
                        # Calculate processing speed safely handling None values
                        if job.started_at is not None:
                            processing_time = time.time() - job.started_at.timestamp()
                            rows_per_second = index / processing_time if processing_time > 0 else 0
                            print(f"Progress: {progress}% ({index+1}/{total_rows}) - Processing at {rows_per_second:.1f} rows/second")
                        else:
                            print(f"Progress: {progress}% ({index+1}/{total_rows})")
                
                # Extract fields for this row - ensure all values are properly handled
                title = str(row[field_mapping['title']]).strip() if row[field_mapping['title']] else "Untitled Product"
                
                # Handle EAN code with extra care
                ean_raw = str(row[field_mapping['ean']]).strip() if row[field_mapping['ean']] else ""
                
                # Apply fix for scientific notation on EAN values - always use consistent method
                ean = fix_scientific_notation(ean_raw)
                
                # Add debug logging for troubleshooting
                if index < 5 or index % 1000 == 0:
                    print(f"Product row {index}: EAN raw='{ean_raw}', normalized='{ean}'")
                
                # Get brand with default
                brand = str(row[field_mapping['brand']]).strip() if row[field_mapping['brand']] else "Unknown Brand"
                
                # NEW LOGIC: Skip only if brand or title is missing/empty
                if not title.strip() or title.lower() == 'nan' or title.lower() == 'none' or title == "Untitled Product":
                    skipped_count += 1
                    if index < 10 or index % 1000 == 0:  # Log first few skips and periodic samples
                        print(f"Row {index}: Skipping product with missing title, current skipped count: {skipped_count}")
                    continue
                
                if not brand.strip() or brand.lower() == 'nan' or brand.lower() == 'none' or brand == "Unknown Brand":
                    skipped_count += 1
                    if index < 10 or index % 1000 == 0:  # Log first few skips and periodic samples
                        print(f"Row {index}: Skipping product with missing brand, current skipped count: {skipped_count}")
                    continue
                
                # Allow duplicate EANs (commented out previous duplicate detection)
                # We're no longer skipping duplicates as requested by the user
                # if ean and ean in seen_eans:
                #     skipped_count += 1
                #     if index < 10 or index % 1000 == 0:
                #         print(f"Row {index}: Skipping duplicate EAN: '{ean}', current skipped count: {skipped_count}")
                #     continue
                
                # For missing EANs, keep the field empty
                if ean and ean.lower() != 'nan' and ean.lower() != 'none':
                    # Remember this EAN to prevent duplicates in the same batch
                    seen_eans.add(ean)
                    if index < 10 or index % 1000 == 0 or index == total_rows - 1:  # Log periodically
                        print(f"Row {index}: Added EAN '{ean}' to tracking set")
                else:
                    # Missing EAN, keep it empty
                    ean = ""
                    if index < 10 or index % 1000 == 0:  # Log periodically
                        print(f"Row {index}: Empty EAN, keeping field empty")
                
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
                
                # Track for supplier product matching - store full details for later matching
                imported_products.append({
                    'id': str(product_id),
                    'ean': ean,
                    'mpn': mpn,
                    'title': title.lower() if title else None,
                })
                    
                                # Save batch of products to Supabase when batch size is reached
                if len(products_batch) >= batch_size:
                    try:
                        # PERFORMANCE OPTIMIZATION: Use more efficient batch handling for large datasets
                        batch_start_time = time.time()
                        print(f"📤 Processing batch of {len(products_batch)} product records")
                        
                        try:
                            # OPTIMIZATION: Use upsert with on_conflict=ignore for faster throughput
                            # This avoids duplicate key errors without checking each record individually
                            result = supabase.table('products').upsert(
                                products_batch, 
                                on_conflict='id'  # Ignore conflicts on id
                            ).execute()
                            
                            # Count successful records
                            if result.data:
                                successful_count += len(result.data)
                                batch_time = time.time() - batch_start_time
                                records_per_sec = len(products_batch) / batch_time if batch_time > 0 else 0
                                print(f"✅ Bulk insert complete: {len(result.data)} records processed in {batch_time:.2f}s ({records_per_sec:.1f} records/sec)")
                            else:
                                print(f"⚠️ Bulk insert returned no data, trying fallback strategy")
                                raise Exception("No data returned from insert operation")
                                
                        except Exception as insert_error:
                            # Better error handling with specific error messages
                            error_msg = str(insert_error)
                            print(f"⚠️ Bulk insert failed: {error_msg}")
                            
                            # OPTIMIZED FALLBACK: Use larger chunks than before for better performance
                            print(f"🔄 Using optimized chunked batch strategy")
                            
                            # Use larger chunks for better performance
                            if total_rows > 50000:
                                CHUNK_SIZE = 250  # Larger chunks for massive files
                            else:
                                CHUNK_SIZE = 100  # Still larger than before but safer for smaller files
                            
                            chunks = [products_batch[i:i+CHUNK_SIZE] for i in range(0, len(products_batch), CHUNK_SIZE)]
                            
                            inserted_count = 0
                            failed_count = 0
                            
                            # Process chunks in parallel for better performance
                            for chunk_index, chunk in enumerate(chunks):
                                chunk_start = time.time()
                                print(f"  Processing chunk {chunk_index+1}/{len(chunks)} ({len(chunk)} records)")
                                try:
                                    # Use upsert to avoid duplicate issues
                                    insert_result = supabase.table('products').upsert(chunk, on_conflict='id').execute()
                                    
                                    # Count successful inserts
                                    if insert_result.data:
                                        count = len(insert_result.data)
                                        inserted_count += count
                                        successful_count += count
                                        chunk_time = time.time() - chunk_start
                                        print(f"    ✓ Inserted {count} products in {chunk_time:.2f}s ({count/chunk_time:.1f}/sec)")
                                    else:
                                        print(f"    ⚠️ Insert returned no data, possible issue")
                                except Exception as chunk_error:
                                    print(f"    ⚠️ Chunk insert failed: {str(chunk_error)}")
                                    
                                    # FALLBACK: Try with smaller sub-chunks instead of individual inserts
                                    print(f"    🔄 Trying with smaller sub-chunks")
                                    sub_chunks = [chunk[i:i+20] for i in range(0, len(chunk), 20)]
                                    sub_success = 0
                                    
                                    for sub_chunk in sub_chunks:
                                        try:
                                            # Regenerate IDs for this sub-chunk to avoid conflicts
                                            for product in sub_chunk:
                                                product['id'] = str(uuid.uuid4())
                                            
                                            result = supabase.table('products').insert(sub_chunk).execute()
                                            if result.data:
                                                new_count = len(result.data)
                                                sub_success += new_count
                                                successful_count += new_count
                                        except Exception:
                                            # Skip the error and continue with next sub-chunk
                                            failed_count += len(sub_chunk)
                                            error_count += len(sub_chunk)
                                    
                                    if sub_success > 0:
                                        print(f"      ✓ Inserted {sub_success} products via sub-chunking")
                            
                            print(f"  Chunk processing complete: {inserted_count} inserted, {failed_count} failed")
                        
                        # Clear batch and report memory usage
                        products_batch = []
                    except Exception as batch_error:
                        print(f"Error handling batch: {str(batch_error)}")
                        error_count += len(products_batch)
                        products_batch = []  # Clear the batch even on error to continue
            except Exception as e:
                print(f"Error processing row {index}: {str(e)}")
                error_count += 1
                continue
        
        
                # Save any remaining products
        if products_batch:
            batch_start_time = time.time()
            print(f"📤 Processing final batch of {len(products_batch)} product records")
            
            try:
                # OPTIMIZATION: Use upsert with on_conflict=ignore for faster throughput
                result = supabase.table('products').upsert(
                    products_batch,
                    on_conflict='id'  # Ignore conflicts on id
                ).execute()
                
                # Count successful records
                if result.data:
                    successful_count += len(result.data)
                    batch_time = time.time() - batch_start_time
                    records_per_sec = len(products_batch) / batch_time if batch_time > 0 else 0
                    print(f"✅ Final batch insert complete: {len(result.data)} records processed in {batch_time:.2f}s ({records_per_sec:.1f} records/sec)")
                else:
                    print(f"⚠️ Final batch insert returned no data, trying fallback approaches")
                    raise Exception("No data returned from insert operation")
                    
            except Exception as insert_error:
                error_msg = str(insert_error)
                print(f"⚠️ Final batch insert failed: {error_msg}")
                
                # OPTIMIZATION: Use larger chunks for better performance
                print(f"🔄 Using optimized chunking strategy for final batch")
                
                # Try with larger chunks for better performance 
                CHUNK_SIZE = 50  # Larger for better performance, but still smaller than main batch
                chunks = [products_batch[i:i+CHUNK_SIZE] for i in range(0, len(products_batch), CHUNK_SIZE)]
                
                inserted_count = 0
                failed_count = 0
                
                for chunk_index, chunk in enumerate(chunks):
                    chunk_start = time.time()
                    print(f"  Processing final chunk {chunk_index+1}/{len(chunks)} ({len(chunk)} records)")
                    try:
                        # Use upsert to avoid duplicate key errors
                        insert_result = supabase.table('products').upsert(chunk, on_conflict='id').execute()
                        
                        # Count successful inserts
                        if insert_result.data:
                            count = len(insert_result.data)
                            inserted_count += count
                            successful_count += count
                            chunk_time = time.time() - chunk_start
                            print(f"    ✓ Inserted {count} products in {chunk_time:.2f}s ({count/chunk_time:.1f}/sec)")
                        else:
                            print(f"    ⚠️ Insert returned no data, possible issue")
                    except Exception as chunk_error:
                        print(f"    ⚠️ Chunk insert failed: {str(chunk_error)}")
                        
                        # Use sub-chunking for better performance than individual inserts
                        print(f"    🔄 Trying with smaller sub-chunks")
                        sub_chunks = [chunk[i:i+10] for i in range(0, len(chunk), 10)]
                        sub_success = 0
                        
                        for sub_chunk in sub_chunks:
                            try:
                                # Regenerate IDs for this sub-chunk
                                for product in sub_chunk:
                                    product['id'] = str(uuid.uuid4())
                                    
                                result = supabase.table('products').insert(sub_chunk).execute()
                                if result.data:
                                    new_count = len(result.data)
                                    sub_success += new_count
                                    successful_count += new_count
                            except Exception:
                                # Skip and continue
                                failed_count += len(sub_chunk)
                                error_count += len(sub_chunk)
                                
                        if sub_success > 0:
                            print(f"      ✓ Inserted {sub_success} products via sub-chunking")
                        
                    print(f"  Final batch processing complete: {inserted_count} inserted, {failed_count} failed")
        
        # Update job status
        job.progress = 90
        job.status_message = f"Imported {successful_count} of {total_rows} products successfully ({skipped_count} skipped). Now matching with supplier products..."
        job.save()
        
        # Calculate success percentage safely
        success_percentage = (successful_count / total_rows * 100) if total_rows > 0 else 0
        print(f"Product import complete. Successfully imported {successful_count} of {total_rows} products ({success_percentage:.1f}%), with {error_count} errors and {skipped_count} skipped.")
                        
        # Replace complex matching logic with hyper-optimized matching for millions of products
        print("\n=== MATCHING PRODUCTS WITH SUPPLIER PRODUCTS ===")
        try:
            # Initialize match statistics for reporting
            match_stats = {
                "total_matched": 0,
                "by_method": {
                    "ean": 0,
                    "mpn": 0,
                    "normalized_ean": 0
                },
                "performance": {
                    "batch_times": [],
                    "total_time_seconds": 0,
                    "products_per_second": 0,
                }
            }
            
            # Update job status
            job.progress = 91
            job.status_message = "Building product lookup tables for efficient matching..."
            job.save()
            
            # Track matching start time for performance reporting
            matching_start_time = time.time()
            
            # CHANGED APPROACH: Only match with products imported in this batch
            print("Building lookup tables from newly imported products...")
            
            # Create lookup dictionaries for newly imported products only
            products_by_ean = {}  # Main lookup table
            products_by_mpn = {}  # MPN lookup table
            special_eans = {'4321': None}  # Track problematic EANs specifically
            
            # Count the imported products
            total_imported = len(imported_products)
            print(f"Found {total_imported} newly imported products for matching")
            
            # Status tracking for user feedback
            job.progress = 92
            job.status_message = f"Processing {total_imported} newly imported products for matching..."
            job.save()
            
            # Process the imported products we tracked during the import
            for product in imported_products:
                product_id = product.get('id')
                
                # Process products with EANs
                if product.get('ean'):
                    ean = product.get('ean')
                    
                    # Store original EAN
                    products_by_ean[ean] = product_id
                    
                    # Store normalized version
                    normalized_ean = fix_scientific_notation(str(ean)).strip().lower()
                    products_by_ean[normalized_ean] = product_id
                    
                    # Store version without leading zeros
                    if normalized_ean and normalized_ean.startswith('0'):
                        products_by_ean[normalized_ean.lstrip('0')] = product_id
                        
                    # Handle special problematic EANs
                    if ean in special_eans:
                        special_eans[ean] = product_id
                        print(f"✅ Found newly imported product with special EAN '{ean}': {product_id}")
                
                # Process products with MPNs
                if product.get('mpn'):
                    mpn = product.get('mpn')
                    if mpn:
                        products_by_mpn[mpn] = product_id
            
            print(f"✅ Processed {total_imported} newly imported products with {len(products_by_ean)} unique EANs")
            
            # Update status for user
            job.progress = 97
            job.status_message = f"Starting supplier product matching process..."
            job.save()
            
            # PERFORMANCE OPTIMIZATION: Count unmatched supplier products first
            unmatched_count_result = supabase.table('supplier_products').select('id', count='exact').is_('product_id', 'null').execute()
            total_unmatched = unmatched_count_result.count if hasattr(unmatched_count_result, 'count') else 0
            
            if not total_unmatched:
                # Fallback method if count exact doesn't work
                try:
                    unmatched_sample = supabase.table('supplier_products').select('id').is_('product_id', 'null').limit(1).execute()
                    if unmatched_sample.data and len(unmatched_sample.data) > 0:
                        # We have unmatched records but can't count them precisely
                        total_unmatched = 1000  # Assume a reasonable number
                    else:
                        total_unmatched = 0  # No unmatched records found
                except:
                    total_unmatched = 0
            
            print(f"Found {total_unmatched} unmatched supplier products to process")
            
            if total_unmatched == 0:
                print("No unmatched supplier products to process")
            else:
                # Process unmatched supplier products in optimized batches
                MATCH_BATCH_SIZE = 2000  # Optimal for matching operations
                offset = 0
                has_more = True
                total_matched = 0
                processed_count = 0
                
                # Status for user
                job.progress = 97
                job.status_message = f"Matching {total_unmatched} supplier products..."
                job.save()
                
                # Track batch processing times for performance metrics
                batch_start_time = time.time()
                
                while has_more:
                    try:
                        # Get batch of unmatched supplier products - filter to only get those with EANs for efficiency
                        unmatched_sp = supabase.table('supplier_products')\
                            .select('id,supplier_id,ean,mpn')\
                            .is_('product_id', 'null')\
                            .not_.is_('ean', 'null')\
                            .range(offset, offset + MATCH_BATCH_SIZE - 1)\
                            .execute()
                        
                        batch_count = len(unmatched_sp.data) if unmatched_sp.data else 0
                        if batch_count == 0:
                            has_more = False
                            break
                            
                        print(f"Processing batch of {batch_count} unmatched supplier products")
                        
                        # OPTIMIZATION: Collect updates for bulk processing
                        bulk_updates = []
                        
                        # Check each record for matches
                        for sp in unmatched_sp.data:
                            # Skip records missing required fields
                            if not sp.get('id') or not sp.get('supplier_id'):
                                print(f"⚠️ Skipping supplier product record missing required fields: {sp.get('id')}")
                                continue
                                
                            # Prepare update data with default ID
                            update_data = None
                            match_method = None
                            
                            # 1. Try to match by exact EAN (highest priority)
                            if sp.get('ean') and sp.get('ean') in products_by_ean:
                                update_data = {
                                    'id': sp.get('id'),
                                    'supplier_id': sp.get('supplier_id'),  # Ensure supplier_id is included
                                    'product_id': products_by_ean[sp.get('ean')],
                                    'match_method': 'ean',
                                    'updated_at': timezone.now().isoformat()
                                }
                                match_stats["by_method"]["ean"] += 1
                            
                            # 2. Try normalized EAN matching
                            elif sp.get('ean'):
                                # Apply normalization
                                normalized_sp_ean = fix_scientific_notation(str(sp.get('ean'))).strip().lower()
                                
                                if normalized_sp_ean in products_by_ean:
                                    update_data = {
                                        'id': sp.get('id'),
                                        'supplier_id': sp.get('supplier_id'),  # Ensure supplier_id is included
                                        'product_id': products_by_ean[normalized_sp_ean],
                                        'match_method': 'normalized_ean',
                                        'updated_at': timezone.now().isoformat()
                                    }
                                    match_stats["by_method"]["normalized_ean"] += 1
                                
                                # Try without leading zeros
                                elif normalized_sp_ean.startswith('0') and normalized_sp_ean.lstrip('0') in products_by_ean:
                                    update_data = {
                                        'id': sp.get('id'),
                                        'supplier_id': sp.get('supplier_id'),  # Ensure supplier_id is included
                                        'product_id': products_by_ean[normalized_sp_ean.lstrip('0')],
                                        'match_method': 'normalized_ean_no_zeros',
                                        'updated_at': timezone.now().isoformat()
                                    }
                                    match_stats["by_method"]["normalized_ean"] += 1
                            
                            # 3. Try MPN matching if no EAN match and MPN exists
                            if update_data is None and sp.get('mpn') and sp.get('mpn') in products_by_mpn:
                                update_data = {
                                    'id': sp.get('id'),
                                    'supplier_id': sp.get('supplier_id'),  # Ensure supplier_id is included
                                    'product_id': products_by_mpn[sp.get('mpn')],
                                    'match_method': 'mpn',
                                    'updated_at': timezone.now().isoformat()
                                }
                                match_stats["by_method"]["mpn"] += 1
                            
                            # Add to bulk update list if we found a match
                            if update_data:
                                bulk_updates.append(update_data)
                        
                        # Process bulk updates for best performance
                        if bulk_updates:
                            # Use smaller chunks for more reliable processing
                            CHUNK_SIZE = 100
                            for i in range(0, len(bulk_updates), CHUNK_SIZE):
                                chunk = bulk_updates[i:i+CHUNK_SIZE]
                                try:
                                    # Use upsert for bulk update
                                    result = supabase.table('supplier_products').upsert(chunk).execute()
                                    chunk_matched = len(result.data) if result.data else 0
                                    total_matched += chunk_matched
                                    match_stats["total_matched"] += chunk_matched
                                except Exception as chunk_error:
                                    print(f"Error processing update chunk: {str(chunk_error)}")
                        
                        # Calculate batch timing for performance metrics
                        batch_end_time = time.time()
                        batch_duration = batch_end_time - batch_start_time
                        match_stats["performance"]["batch_times"].append(batch_duration)
                        batch_start_time = batch_end_time  # Reset for next batch
                        
                        # Update processed count for progress tracking
                        processed_count += batch_count
                        if total_unmatched > 0:
                            match_progress = min(99, 97 + int((processed_count / total_unmatched) * 2))
                            if job.progress != match_progress:
                                # Update progress and show match stats to user
                                job.progress = match_progress
                                match_rate = (total_matched / processed_count * 100) if processed_count > 0 else 0
                                job.status_message = f"Matched {total_matched} of {processed_count} supplier products processed ({match_rate:.1f}% match rate)..."
                                job.save()
                        
                        # Move to next batch
                        offset += MATCH_BATCH_SIZE
                        print(f"Total matched so far: {total_matched}")
                    
                    except Exception as batch_error:
                        print(f"Error processing batch: {str(batch_error)}")
                        # Continue to next batch
                        offset += MATCH_BATCH_SIZE
                        continue
                
                # Calculate final performance metrics
                matching_end_time = time.time()
                total_matching_time = matching_end_time - matching_start_time
                match_stats["performance"]["total_time_seconds"] = total_matching_time
                products_per_second = processed_count / total_matching_time if total_matching_time > 0 else 0
                match_stats["performance"]["products_per_second"] = products_per_second
                
                print(f"\n=== MATCHING PERFORMANCE ===")
                print(f"Total processing time: {total_matching_time:.2f} seconds")
                print(f"Processing speed: {products_per_second:.1f} products/second")
                
                # Prevent division by zero when calculating match rate
                if processed_count > 0:
                    match_rate = (total_matched / processed_count * 100)
                    print(f"Match rate: {match_rate:.1f}% ({total_matched} of {processed_count})")
                else:
                    match_rate = 0
                    print(f"Match rate: 0.0% (No products were processed)")
                
                # Update match_stats for reporting in the UI
                match_stats["match_rate_percent"] = (total_matched / processed_count * 100) if processed_count > 0 else 0
                match_stats["processed_count"] = processed_count
                match_stats["total_matched"] = total_matched
                match_stats["batch_count"] = len(match_stats["performance"]["batch_times"])
                match_stats["avg_batch_time"] = sum(match_stats["performance"]["batch_times"]) / len(match_stats["performance"]["batch_times"]) if match_stats["performance"]["batch_times"] else 0
                # Remove raw batch times from the stats to keep the size reasonable
                match_stats["performance"].pop("batch_times", None)
                
                print(f"\n=== MATCHING COMPLETE ===")
                print(f"Total matched: {match_stats['total_matched']} supplier products")
                print(f"By EAN: {match_stats['by_method']['ean']}")
                print(f"By Normalized EAN: {match_stats['by_method']['normalized_ean']}")
                print(f"By MPN: {match_stats['by_method']['mpn']}")
                
                # 4. Update supplier is_matched flag for any matched suppliers in bulk
                if total_matched > 0:
                    try:
                        # Get all supplier IDs that have matched products
                        matched_suppliers = supabase.table('supplier_products')\
                            .select('supplier_id')\
                            .not_.is_('product_id', 'null')\
                            .execute()
                        
                        # Get unique supplier IDs
                        supplier_ids = set()
                        if matched_suppliers.data:
                            for row in matched_suppliers.data:
                                if 'supplier_id' in row:
                                    supplier_ids.add(row['supplier_id'])
                        
                        # Bulk update suppliers
                        if supplier_ids:
                            # Convert to list for Supabase operations
                            supplier_updates = [{'id': sid, 'is_matched': True} for sid in supplier_ids]
                            
                            # Process in smaller chunks
                            SUPPLIER_CHUNK_SIZE = 50
                            for i in range(0, len(supplier_updates), SUPPLIER_CHUNK_SIZE):
                                chunk = supplier_updates[i:i+SUPPLIER_CHUNK_SIZE]
                                try:
                                    supabase.table('suppliers').upsert(chunk).execute()
                                except Exception as chunk_error:
                                    print(f"Error updating suppliers chunk: {str(chunk_error)}")
                                    continue
                                
                            print(f"✅ Updated is_matched flag for {len(supplier_ids)} suppliers")
                    except Exception as supplier_error:
                        print(f"⚠️ Error updating supplier match status: {str(supplier_error)}")
                
                # Add matching stats to job results for UI
                if not job.results:
                    job.results = {}
                job.results['match_stats'] = match_stats
                
        except Exception as matching_error:
            print(f"❌ Error during matching: {str(matching_error)}")
            print(traceback.format_exc())
            
        # Add a streamlined diagnostic check (optimized for speed)
        try:
            print("\n=== QUICK DIAGNOSTIC: Checking problematic EANs ===")
            
            # Only check known problematic EANs
            problematic_ean = '4321'  # The main known problematic EAN
            
            # Check products with this EAN
            products_check = supabase.table('products').select('id,ean').eq('ean', problematic_ean).execute()
            sp_check = supabase.table('supplier_products').select('id,ean,product_id').eq('ean', problematic_ean).execute()
            
            if products_check.data and sp_check.data:
                product_count = len(products_check.data)
                sp_count = len(sp_check.data)
                
                # Count unmatched supplier products
                unmatched = [sp for sp in sp_check.data if not sp.get('product_id')]
                unmatched_count = len(unmatched)
                
                print(f"EAN '{problematic_ean}': Found {product_count} products and {sp_count} supplier products ({unmatched_count} unmatched)")
                
                # Try to fix any remaining unmatched items
                if unmatched and products_check.data:
                    product_id = products_check.data[0]['id']
                    print(f"Applying direct fix to {unmatched_count} unmatched supplier products with EAN '{problematic_ean}'")
                    
                    for sp in unmatched:
                        try:
                            supabase.table('supplier_products')\
                                .update({\
                                    'product_id': product_id,\
                                    'match_method': 'direct_fix',\
                                    'updated_at': timezone.now().isoformat()\
                                })\
                                .eq('id', sp['id'])\
                                .execute()
                            print(f"  ✅ Fixed supplier product {sp['id']}")
                        except Exception as fix_error:
                            print(f"  ❌ Error fixing: {str(fix_error)}")
            
            # Skip extensive diagnostic for speed - just check a very small sample
            SAMPLE_SIZE = 5  # Reduced from 100 for much better performance
            
            sample_products = supabase.table('products').select('id,ean').order('created_at', desc=True).limit(SAMPLE_SIZE).execute()
            
            if sample_products.data:
                ean_count = sum(1 for p in sample_products.data if p.get('ean'))
                print(f"Sampled {len(sample_products.data)} recent products ({ean_count} with EANs)")
                
                # Just count issues rather than detailed analysis
                unmatched_count = 0
                
                for product in sample_products.data:
                    if product.get('ean'):
                        # Check if these products have unmatched supplier products with the same EAN
                        sp_result = supabase.table('supplier_products')\
                            .select('id')\
                            .eq('ean', product.get('ean'))\
                            .is_('product_id', 'null')\
                            .execute()
                        
                        if sp_result.data and len(sp_result.data) > 0:
                            unmatched_count += len(sp_result.data)
                
                if unmatched_count > 0:
                    print(f"⚠️ Found {unmatched_count} unmatched supplier products for sampled products")
                else:
                    print(f"✅ No matching issues found in product sample")
                
        except Exception as diagnostic_error:
            print(f"Error during diagnostics: {str(diagnostic_error)}")
            # Continue processing even if diagnostics fail
        
        # Update job status as completed
        job.status = 'completed'
        job.progress = 100
        job.completed_at = timezone.now()
        
        # Ensure we have a results dictionary
        if not hasattr(job, 'results') or job.results is None:
            job.results = {}
            
        # Store processing statistics directly in results (matching frontend expectation)
        job.results['total'] = total_rows
        job.results['successful'] = successful_count
        job.results['skipped'] = skipped_count
        job.results['failed'] = error_count
        
        # Create detailed status message with all statistics for the success modal
        processing_summary = f"{successful_count} of {total_rows} products successfully imported"
        if skipped_count > 0:
            processing_summary += f", {skipped_count} skipped"
        if error_count > 0:
            processing_summary += f", {error_count} failed"
            
        # Add matching statistics if available
        match_stats_summary = ""
        if 'match_stats' in locals():
            # Store match stats in a way the frontend expects
            if 'by_method' in match_stats:
                job.results['match_by_ean'] = match_stats['by_method'].get('ean', 0)
                job.results['match_by_mpn'] = match_stats['by_method'].get('mpn', 0)
                job.results['match_by_name'] = match_stats['by_method'].get('name', 0)
            job.results['total_matched'] = match_stats.get('total_matched', 0)
            
            # Get statistics for the message
            matched = match_stats.get('total_matched', 0)
            processed = match_stats.get('processed_count', 0)
            match_rate = match_stats.get('match_rate_percent', 0)
            
            # Generate summary message
            if processed > 0:
                match_stats_summary = f" and matched {matched} supplier products ({match_rate:.1f}%)"
            elif matched > 0:
                match_stats_summary = f" and matched {matched} supplier products"
            else:
                match_stats_summary = " (no supplier products were matched)"
        
        job.status_message = f"Import completed: {processing_summary}{match_stats_summary}"
        job.save()
        
        # Debug log the final results structure for troubleshooting
        print(f"\n=== DEBUG: FINAL JOB RESULTS ===")
        print(f"Job ID: {job.id}")
        print(f"Status: {job.status}")
        print(f"Message: {job.status_message}")
        print(f"Results: {job.results}")
        print(f"Total: {job.results.get('total')}")
        print(f"Successful: {job.results.get('successful')}")
        print(f"Skipped: {job.results.get('skipped')}")
        print(f"Failed: {job.results.get('failed')}")
        print(f"Matched: {job.results.get('total_matched')}")
        print(f"=============================\n")
        
        # Create import history record
        ImportHistory.objects.create(
            type='Amazon Data',
            file_name=job.file_name,
            status='Completed',
            total_records=total_rows,
            successful_records=successful_count,
            failed_records=error_count,
            created_by=job.user
        )
        
        return job
    except Exception as e:
        job.status = 'failed'
        job.status_message = str(e)
        job.save()
        
        # Log detailed error
        print(f"❌ IMPORT FAILED: {str(e)}")
        print(traceback.format_exc())
        
        # Create import history record
        ImportHistory.objects.create(
            type='Amazon Data',
            file_name=job.file_name,
            status='Failed',
            error_message=str(e),
            created_by=job.user
        )
        
        # Re-raise for outer exception handler
        raise 
        
    return job