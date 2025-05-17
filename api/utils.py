from supabase import create_client
import os
from django.conf import settings
import re

def get_supabase_client():
    """
    Creates and returns a Supabase client using settings from Django settings
    """
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_KEY')
    
    if not url or not key:
        raise ValueError("Supabase URL and key must be set as environment variables")
    
    # Add debug info about the Supabase connection details
    print(f"🔍 DEBUG: Initializing Supabase client with URL: {url[:20]}...{url[-8:] if len(url) > 28 else ''}")
    print(f"🔍 DEBUG: Using API key starting with: {key[:6]}...")
    
    # Remove any proxy settings that might be causing issues
    # Initialize with just the required parameters
    client = create_client(url, key)
    
    # Log the created client details to verify
    print(f"🔍 DEBUG: Supabase client initialized with type: {type(client)}")
    print(f"🔍 DEBUG: Client methods available: {[method for method in dir(client) if not method.startswith('_') and method in ['from_', 'rpc', 'table']]}")
    
    return client


def fix_scientific_notation(value):
    """
    Fixes scientific notation in EAN codes and other numeric values
    For example, converts 8.40E+11 to 840000000000
    
    Args:
        value: The value to fix (string, number, or None)
        
    Returns:
        String representation of the value with scientific notation fixed
    """
    if value is None:
        return ""
    
    # Convert to string and trim whitespace
    string_value = str(value).strip()
    
    # Handle empty strings
    if not string_value:
        return ""
    
    # Handle 'NaN', 'nan', 'None', etc.
    if string_value.lower() in ('nan', 'none', 'null', 'undefined'):
        return ""
    
    # Check if the value is in scientific notation with standard format (e.g., 8.40E+11)
    scientific_notation_regex = r'^(\d+\.\d+)[eE][\+\-](\d+)$'
    match = re.match(scientific_notation_regex, string_value)
    
    if match:
        try:
            # Extract base number and exponent
            base_number = float(match.group(1))
            exponent = int(match.group(2))
            
            # Safety check - for extremely large exponents, don't try to calculate
            if abs(exponent) > 100:
                print(f"Exponent too large ({exponent}), treating as string: {string_value}")
                # Format as a standardized but string-based representation
                if exponent > 0:
                    # For positive exponents, return base * 10^exp
                    digits_before_decimal = 1  # Always at least 1 digit before decimal in scientific notation
                    # Move the decimal point right by exponent
                    base_str = str(base_number).replace('.', '')
                    return base_str + '0' * (exponent - (len(base_str) - digits_before_decimal))
                else:
                    # For negative exponents, just return a small value like 0
                    return "0"
            
            # Calculate the actual number and convert to string
            # For example: 8.40E+11 becomes 840000000000
            actual_number = base_number * (10 ** exponent)
            
            # Convert to string and remove any decimal part for integer-like values
            if actual_number.is_integer():
                return str(int(actual_number))
            else:
                return str(actual_number)
        except (ValueError, OverflowError) as e:
            print(f"Error processing scientific notation {string_value}: {str(e)}")
            # Just return the base number as a string
            return str(base_number).replace('.', '') + '0' * abs(exponent)
    
    # Also check for scientific notation without decimal point (e.g., 5E9)
    simple_scientific_regex = r'^(\d+)[eE][\+\-]?(\d+)$'
    match = re.match(simple_scientific_regex, string_value)
    
    if match:
        try:
            # Extract base number and exponent
            base_number = int(match.group(1))
            exponent = int(match.group(2))
            
            # Safety check - for extremely large exponents, don't try to calculate
            if abs(exponent) > 100:
                print(f"Exponent too large ({exponent}), treating as string: {string_value}")
                # Format as a standardized but string-based representation
                if exponent > 0:
                    # For positive exponents, return base * 10^exp
                    base_str = str(base_number)
                    return base_str + '0' * exponent
                else:
                    # For negative exponents, just return a small value like 0
                    return "0"
            
            # Calculate the actual number and convert to string
            actual_number = base_number * (10 ** exponent)
            
            # Return as integer string
            return str(actual_number)
        except (ValueError, OverflowError) as e:
            print(f"Error processing scientific notation {string_value}: {str(e)}")
            # Just return the base number padded with zeros
            return str(base_number) + '0' * abs(exponent)
    
    # Try to see if it's a float that Python automatically converted to scientific notation
    try:
        # If the value can be parsed as a float
        float_value = float(string_value)
        
        # Check if it's not a normal-looking float - would be converted to scientific notation
        if abs(float_value) > 1e10 or (float_value != 0 and abs(float_value) < 1e-10):
            # For integer-like values, return without decimal part
            if float_value.is_integer():
                return str(int(float_value))
            return str(float_value)
    except (ValueError, OverflowError):
        # Not a valid float - just return the original
        pass
    
    # If not in scientific notation, just return the trimmed string
    return string_value


def sanitize_json_value(value):
    """
    Sanitizes a value to ensure it's JSON compliant by handling:
    - Out of range float values (too large or small)
    - Non-JSON-compliant values like NaN, Infinity, -Infinity
    - Scientific notation beyond JSON limits
    
    Args:
        value: Any data value that might need sanitizing
        
    Returns:
        A JSON-safe version of the value (may be converted to string for extremely large numbers)
    """
    # Handle None values
    if value is None:
        return None
    
    # If it's a string, check for scientific notation that might need fixing
    if isinstance(value, str):
        if 'e' in value.lower() or 'E' in value:
            # It might be scientific notation, try to fix it
            return fix_scientific_notation(value)
        return value
    
    # Handle boolean values
    if isinstance(value, bool):
        return value
    
    # Handle integer values
    if isinstance(value, int):
        # Check if the integer is within safe JSON range
        # Use str for extremely large integers beyond ±2^53
        if abs(value) > 9007199254740991:  # 2^53 - 1 (max safe integer in JSON)
            return str(value)
        return value
    
    # Handle float values
    if isinstance(value, float):
        # Check for non-finite values
        if value != value:  # NaN check
            return None
        if value == float('inf'):
            return "Infinity"
        if value == float('-inf'):
            return "-Infinity"
            
        # Check for extremely large or small values
        # Maximum finite value in JSON is approximately 1.7976931348623157e+308
        if abs(value) > 1.7e+308:
            return str(value)
            
        # Very small numbers close to zero
        if value != 0 and abs(value) < 1e-308:
            return 0.0
            
        return value
    
    # For other types (like lists, dicts), return as is
    # Note: For complex data types, you should sanitize each element separately
    return value


def sanitize_json_object(obj):
    """
    Recursively sanitizes all values in a dictionary/object to ensure it's JSON compliant.
    Works with nested objects, lists, and other complex structures.
    
    Args:
        obj: Dictionary, list, or other value to sanitize
        
    Returns:
        A copy of the object with all values sanitized for JSON compliance
    """
    if isinstance(obj, dict):
        # Process each key-value pair in the dictionary
        return {key: sanitize_json_object(value) for key, value in obj.items()}
    
    elif isinstance(obj, list):
        # Process each item in the list
        return [sanitize_json_object(item) for item in obj]
    
    else:
        # It's a primitive value, sanitize it directly
        return sanitize_json_value(obj)


# Helper functions for common Supabase operations
def fetch_products(filters=None, limit=50, offset=0):
    """
    Fetch products from Supabase with optional filtering
    """
    supabase = get_supabase_client()
    query = supabase.table('products').select('*')
    
    if filters:
        for key, value in filters.items():
            if key == 'search':
                # Search in title, ean, or mpn
                query = query.or_(f'title.ilike.%{value}%,ean.ilike.%{value}%,mpn.ilike.%{value}%')
            elif key == 'category':
                query = query.ilike('category', f'%{value}%')
            elif key == 'brand':
                query = query.ilike('brand', f'%{value}%')
    
    # Add pagination
    query = query.range(offset, offset + limit - 1)
    
    return query.execute()


def fetch_suppliers(filters=None, limit=50, offset=0):
    """
    Fetch suppliers from Supabase with optional filtering
    """
    supabase = get_supabase_client()
    query = supabase.table('suppliers').select('*')
    
    if filters and 'search' in filters:
        query = query.ilike('name', f'%{filters["search"]}%')
    
    # Add pagination
    query = query.range(offset, offset + limit - 1)
    
    return query.execute()


def fetch_supplier_products(supplier_id=None, product_id=None, limit=50, offset=0):
    """
    Fetch supplier products with optional filtering by supplier or product
    """
    supabase = get_supabase_client()
    query = supabase.table('supplier_products').select('*')
    
    if supplier_id:
        query = query.eq('supplier', supplier_id)
    
    if product_id:
        query = query.eq('product', product_id)
    
    # Add pagination
    query = query.range(offset, offset + limit - 1)
    
    return query.execute()


def create_or_update_record(table, data, id_field='id', id_value=None):
    """
    Create a new record or update an existing one
    """
    supabase = get_supabase_client()
    
    if id_value:
        # Update existing record
        return supabase.table(table).update(data).eq(id_field, id_value).execute()
    else:
        # Create new record
        return supabase.table(table).insert(data).execute()


def delete_record(table, id_field='id', id_value=None):
    """
    Delete a record by ID
    """
    if not id_value:
        raise ValueError(f"ID value must be provided to delete a {table} record")
    
    supabase = get_supabase_client()
    return supabase.table(table).delete().eq(id_field, id_value).execute()


def auto_map_amazon_fields(columns):
    """
    Auto-map CSV column names to Amazon product fields
    """
    field_mapping = {}
    
    for col in columns:
        col_lower = col.lower()
        if 'title' in col_lower or 'product name' in col_lower:
            field_mapping['title'] = col
        elif 'ean' in col_lower or 'barcode' in col_lower:
            field_mapping['ean'] = col
        elif 'mpn' in col_lower or 'manufacturer part' in col_lower:
            field_mapping['mpn'] = col
        elif 'brand' in col_lower:
            field_mapping['brand'] = col
        elif 'sale price' in col_lower or 'saleprice' in col_lower:
            field_mapping['sale_price'] = col
        elif 'unit sold' in col_lower or 'monthly unit' in col_lower:
            field_mapping['units_sold'] = col
        elif 'amazon fee' in col_lower:
            field_mapping['amazon_fee'] = col
        elif 'buy box price' in col_lower:
            field_mapping['buy_box_price'] = col
        elif 'category' in col_lower:
            field_mapping['category'] = col
        elif 'rating' in col_lower:
            field_mapping['rating'] = col
        elif 'review' in col_lower:
            field_mapping['review_count'] = col
        # New fields
        elif 'asin' in col_lower:
            field_mapping['asin'] = col
        elif 'upc' in col_lower:
            field_mapping['upc'] = col
        elif 'fba fee' in col_lower:
            field_mapping['fba_fees'] = col
        elif 'referral fee' in col_lower:
            field_mapping['referral_fee'] = col
        elif 'bought' in col_lower and 'month' in col_lower:
            field_mapping['bought_past_month'] = col
        elif 'monthly revenue' in col_lower or 'estimated revenue' in col_lower:
            field_mapping['estimated_monthly_revenue'] = col
        elif 'fba seller' in col_lower:
            field_mapping['fba_sellers'] = col
        elif 'instock rate' in col_lower or 'in stock rate' in col_lower:
            field_mapping['amazon_instock_rate'] = col
        elif 'dominant seller' in col_lower:
            field_mapping['dominant_seller_percentage'] = col
        elif 'buy box seller' in col_lower or 'seller name' in col_lower:
            field_mapping['buy_box_seller_name'] = col
        elif 'live offer' in col_lower or 'offer count' in col_lower:
            field_mapping['live_offers_count'] = col
    
    return field_mapping 


def detect_and_fix_duplicate_supplier_products():
    """
    Utility function to detect and fix duplicate supplier product entries
    in the database. This can be used to clean up the database if duplicate
    entries are causing problems with imports.
    
    Returns:
        dict: A report of the cleanup operation
    """
    from django.db import connection
    import json
    
    duplicates_found = 0
    duplicates_merged = 0
    errors = []
    
    try:
        with connection.cursor() as cursor:
            # Find duplicate supplier_id/product_id combinations
            cursor.execute("""
            WITH duplicate_pairs AS (
                SELECT supplier_id, product_id, COUNT(*) as count
                FROM supplier_products
                WHERE product_id IS NOT NULL
                GROUP BY supplier_id, product_id
                HAVING COUNT(*) > 1
            )
            SELECT 
                sp.id, 
                sp.supplier_id, 
                sp.product_id, 
                sp.cost, 
                sp.supplier_stock,
                sp.updated_at
            FROM supplier_products sp
            JOIN duplicate_pairs dp ON 
                sp.supplier_id = dp.supplier_id AND 
                sp.product_id = dp.product_id
            ORDER BY sp.supplier_id, sp.product_id, sp.updated_at DESC;
            """)
            
            duplicate_records = cursor.fetchall()
            if not duplicate_records:
                return {"status": "success", "message": "No duplicate supplier_id/product_id combinations found."}
                
            duplicates_found = len(duplicate_records)
            
            # Group by supplier_id/product_id to process each set of duplicates
            current_pair = None
            records_to_keep = []
            records_to_delete = []
            
            for record in duplicate_records:
                record_id, supplier_id, product_id, cost, supplier_stock, updated_at = record
                
                # Convert to string for key comparison
                pair_key = f"{supplier_id}_{product_id}"
                
                if current_pair != pair_key:
                    # This is a new supplier_id/product_id combination
                    current_pair = pair_key
                    records_to_keep.append(record_id)
                else:
                    # This is a duplicate of the current pair
                    records_to_delete.append(record_id)
            
            # Delete the duplicates, keeping the first record for each pair
            if records_to_delete:
                placeholders = ','.join(['%s'] * len(records_to_delete))
                cursor.execute(f"""
                DELETE FROM supplier_products
                WHERE id IN ({placeholders});
                """, records_to_delete)
                duplicates_merged = len(records_to_delete)
            
            # Find duplicate supplier_id/ean combinations (for records with no product_id)
            cursor.execute("""
            WITH duplicate_eans AS (
                SELECT supplier_id, ean, COUNT(*) as count
                FROM supplier_products
                WHERE product_id IS NULL 
                AND ean IS NOT NULL
                AND ean != ''
                GROUP BY supplier_id, ean
                HAVING COUNT(*) > 1
            )
            SELECT 
                sp.id, 
                sp.supplier_id, 
                sp.ean, 
                sp.cost, 
                sp.supplier_stock,
                sp.updated_at
            FROM supplier_products sp
            JOIN duplicate_eans de ON 
                sp.supplier_id = de.supplier_id AND 
                sp.ean = de.ean
            ORDER BY sp.supplier_id, sp.ean, sp.updated_at DESC;
            """)
            
            duplicate_ean_records = cursor.fetchall()
            if duplicate_ean_records:
                # Group by supplier_id/ean to process each set of duplicates
                current_ean_pair = None
                ean_records_to_keep = []
                ean_records_to_delete = []
                
                for record in duplicate_ean_records:
                    record_id, supplier_id, ean, cost, supplier_stock, updated_at = record
                    
                    # Convert to string for key comparison
                    pair_key = f"{supplier_id}_{ean}"
                    
                    if current_ean_pair != pair_key:
                        # This is a new supplier_id/ean combination
                        current_ean_pair = pair_key
                        ean_records_to_keep.append(record_id)
                    else:
                        # This is a duplicate of the current pair
                        ean_records_to_delete.append(record_id)
                
                # Delete the duplicates, keeping the first record for each pair
                if ean_records_to_delete:
                    placeholders = ','.join(['%s'] * len(ean_records_to_delete))
                    cursor.execute(f"""
                    DELETE FROM supplier_products
                    WHERE id IN ({placeholders});
                    """, ean_records_to_delete)
                    duplicates_merged += len(ean_records_to_delete)
            
        return {
            "status": "success",
            "duplicates_found": duplicates_found + len(duplicate_ean_records if duplicate_ean_records else []),
            "duplicates_merged": duplicates_merged,
            "error_count": len(errors),
            "errors": errors
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error while fixing duplicates: {str(e)}",
            "duplicates_found": duplicates_found,
            "duplicates_merged": duplicates_merged,
            "error_count": 1,
            "errors": [str(e)]
        } 