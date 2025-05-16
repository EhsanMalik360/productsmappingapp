# Products Mapping Web App - Django Backend

This project is a Django REST API backend for the Products Mapping Web App. It replaces the original Express.js backend while maintaining compatibility with the existing React frontend and using the Supabase database.

## Features

- REST API for managing products, suppliers, and their relationships
- File upload and processing capabilities for CSV/Excel files
- Background processing with Celery for handling large files
- Product matching algorithms
- Profit analysis calculations
- Integration with existing Supabase database using Supabase REST API

## Tech Stack

- Django 5.0+
- Django REST Framework
- Celery for background tasks
- Supabase Python client for API access
- SQLite as fallback (when not using Supabase)
- JWT for authentication

## Setup and Installation

### Prerequisites

- Python 3.9+
- Node.js and npm (for frontend)
- Redis (for Celery, optional)
- Supabase account with existing project

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/products-mapping-webapp.git
   cd products-mapping-webapp
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Get your Supabase credentials from your Supabase project dashboard:
   - SUPABASE_URL: Your Supabase project URL (e.g., https://xyzabcdef.supabase.co)
   - SUPABASE_KEY: Your Supabase public anon key

5. Set up environment variables:
   - Set `SUPABASE_URL` and `SUPABASE_KEY` environment variables, or
   - Create a `.env` file with these values, or
   - Provide them when running the server start script

6. Run the included start script to launch the Django server:
   ```bash
   # On Windows
   start-django.bat
   
   # On macOS/Linux
   ./start-django.sh
   ```

### Running the Application

The start script will automatically:
1. Create a virtual environment if needed
2. Install dependencies
3. Prompt for Supabase credentials if not found in environment variables
4. Set up to use Supabase REST API instead of direct database connection
5. Start the Django development server

You can also run Django directly:
```bash
python manage.py run_server --supabase-url="YOUR_SUPABASE_URL" --supabase-key="YOUR_SUPABASE_KEY"
```

Access the application:
- API: http://localhost:8000/api/
- Admin interface: http://localhost:8000/admin/

## Supabase Integration

This project supports two methods of integrating with Supabase:

### 1. Supabase REST API (Recommended)

By default, the application uses the Supabase REST API through the official Python client. This method:
- Avoids direct database connection issues
- Works reliably from any network
- Properly enforces Row Level Security policies
- Respects Supabase access rules

This is controlled by the `USE_SUPABASE_API` environment variable which is set to `True` by default in the start scripts.

### 2. Direct PostgreSQL Connection

For advanced use cases, you can set `USE_SUPABASE_API=False` to use a direct connection to the Supabase PostgreSQL database. 
Note that:
- This may not work from all networks due to firewall restrictions
- It uses the connection pooler on port 6543 to improve reliability 
- It bypasses Supabase RLS policies

To enable this mode:
```bash
# Windows
set USE_SUPABASE_API=False
python manage.py run_server

# Linux/macOS
export USE_SUPABASE_API=False
python manage.py run_server
```

## API Endpoints

### Health Check and Configuration
- `GET /api/health/` - Check API health
- `GET /api/config/` - Get server configuration

### Suppliers
- `GET /api/suppliers/` - List all suppliers
- `POST /api/suppliers/` - Create a new supplier
- `GET /api/suppliers/:id/` - Get supplier details
- `PUT /api/suppliers/:id/` - Update a supplier
- `DELETE /api/suppliers/:id/` - Delete a supplier

### Products
- `GET /api/products/` - List all products
- `POST /api/products/` - Create a new product
- `GET /api/products/:id/` - Get product details
- `PUT /api/products/:id/` - Update a product
- `DELETE /api/products/:id/` - Delete a product

### Supplier Products
- `GET /api/supplier-products/` - List all supplier-product mappings
- `POST /api/supplier-products/` - Create a new mapping
- `GET /api/supplier-products/:id/` - Get mapping details
- `PUT /api/supplier-products/:id/` - Update a mapping
- `DELETE /api/supplier-products/:id/` - Delete a mapping

### Import and Upload
- `POST /api/upload/supplier/` - Upload supplier data file
- `POST /api/upload/amazon/` - Upload Amazon product data file
- `GET /api/upload/status/:job_id/` - Check import job status
- `GET /api/import-history/` - Get import job history

### Analysis
- `GET /api/profit-analysis/` - Get profit analysis data

## Database Models

The main models in this application match the existing Supabase tables:

- `Product`: Stores Amazon product information
- `Supplier`: Stores supplier information
- `SupplierProduct`: Maps supplier products to Amazon products
- `ImportJob`: Tracks file import jobs
- `ImportHistory`: Stores history of import operations

## Background Processing

File uploads are processed in the background using Celery tasks:

- `process_file_upload`: Main task that processes both supplier and product files

## Deployment

For production deployment:

1. Set `DEBUG=False` in your environment
2. Set a strong `SECRET_KEY`
3. Configure proper `ALLOWED_HOSTS`
4. Use a production-ready web server (Gunicorn, uWSGI)
5. Set up static file serving with Nginx or a CDN
6. Configure proper security settings (HTTPS, etc.)

Example production deployment using Gunicorn:

```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn, setting environment variables
SUPABASE_URL=your_url SUPABASE_KEY=your_key USE_SUPABASE_API=True gunicorn products_mapping_project.wsgi:application --bind 0.0.0.0:8000
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 