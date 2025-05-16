"""
This script searches through the bundled JS files to find API endpoints
"""
import os
import re
import json

# Path to assets folder
ASSETS_DIR = 'dist/assets'

def find_endpoints():
    """Find all API endpoints in the JS bundle files"""
    endpoints = []
    
    # Find all JS files in the assets directory
    js_files = []
    for file in os.listdir(ASSETS_DIR):
        if file.endswith('.js'):
            js_files.append(os.path.join(ASSETS_DIR, file))
    
    # Search for upload endpoints in each file
    for js_file in js_files:
        print(f"Searching in {js_file}...")
        with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Look for URLs with upload in them
            upload_urls = re.findall(r'["\'](/api/upload/[^"\'\s]+)["\']', content)
            endpoints.extend(upload_urls)
            
            # Also look for full URLs with localhost and upload
            full_urls = re.findall(r'["\'](https?://localhost:[0-9]+/api/upload/[^"\'\s]+)["\']', content)
            endpoints.extend(full_urls)
            
            # Find any API configuration objects
            api_configs = re.findall(r'uploadSupplierFile|uploadAmazonFile|uploadProductFile', content)
            if api_configs:
                print(f"Found API config functions in {js_file}: {api_configs}")
    
    # Remove duplicates and sort
    endpoints = sorted(set(endpoints))
    
    print("\nDiscovered API endpoints:")
    for endpoint in endpoints:
        print(f"  {endpoint}")
    
    # Output to a JSON file
    with open('api_endpoints.json', 'w') as f:
        json.dump({"endpoints": endpoints}, f, indent=2)
    
    print(f"\nEndpoints saved to api_endpoints.json")

if __name__ == "__main__":
    find_endpoints() 