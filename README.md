# Products Mapping Web App

A web application for mapping supplier products to Amazon products and analyzing profit margins.

## Features

- Upload and process Amazon product data
- Upload and process supplier product data
- Automatically match supplier products to Amazon listings
- Calculate profit margins and analyze profitability
- Manage products and suppliers
- Filter and search capabilities
- Data visualization

## Technical Stack

- **Frontend**:
  - React with TypeScript
  - Vite for development and building
  - TailwindCSS for styling
  - Chart.js for data visualization

- **Backend**:
  - Django with Django REST Framework
  - Supabase for database and authentication
  - Celery for background processing

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.9+)
- PostgreSQL (via Supabase)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd productsmappingwebapp
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the root with:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Running the Application

#### Option 1: Run Both Services Separately

1. Start the Django backend:
   ```bash
   # On Windows
   .\start-django.bat
   
   # On macOS/Linux
   ./start-django.sh
   ```

2. In a separate terminal, start the React frontend:
   ```bash
   # On Windows
   .\start-frontend.bat
   
   # On macOS/Linux
   ./start-frontend.sh
   ```

3. Access the application at: http://localhost:3000

#### Option 2: Build Frontend for Production

1. Build the React frontend:
   ```bash
   npm run build
   ```

2. Start the Django server which will serve both API and frontend:
   ```bash
   python manage.py run_server
   ```

3. Access the application at: http://localhost:8000

## Development Notes

- The frontend development server proxies API requests to the Django backend
- For direct database access, set `USE_SUPABASE_API=False` before starting Django
- File uploads are processed in the background using Celery

## Project Structure

- `/api` - Django API and models
- `/products_mapping_project` - Django project configuration
- `/src` - React frontend source
  - `/components` - React components
  - `/pages` - Page components
  - `/lib` - Utility functions and API client
  - `/hooks` - React hooks
  - `/context` - React context providers

## Additional Documentation

- [Django Backend README](README-DJANGO.md) - Detailed information about the Django backend
- [API Documentation](api/README.md) - API endpoints and usage

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Fixing Duplicate Supplier Products

If you encounter issues with duplicate key violations when importing supplier data, you can use the fix-duplicates API endpoint to clean up the database.

Run the following command to detect and fix duplicates:

```bash
curl -X POST http://localhost:3001/api/admin/fix-duplicates/
```

This will:
1. Find and remove duplicate supplier_id + product_id combinations
2. Find and remove duplicate supplier_id + ean combinations for unmatched products
3. Return a report showing how many duplicates were found and fixed

Example response:
```json
{
  "status": "success",
  "duplicates_found": 42,
  "duplicates_merged": 42,
  "error_count": 0,
  "errors": []
}
```