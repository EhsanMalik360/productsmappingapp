# Product-Supplier Mapping System

A system for managing product-supplier relationships for e-commerce applications.

## Custom Attributes Implementation

The system supports custom attributes for both products and suppliers:

1. **Direct Column Mapping**: Custom attributes are stored as dedicated columns in their respective tables (products/suppliers).
   - Column names follow the pattern `custom_attribute_name` (e.g., `custom_mpn`, `custom_ean`, etc.)
   - This provides faster access and better type safety
   - All attributes are stored directly in their respective tables

2. **MPN Field Synchronization**: When a value is mapped to the custom MPN field, it is automatically stored in both:
   - The `custom_mpn` column for consistent custom attribute handling
   - The standard `mpn` column for improved compatibility with existing code

### Database Schema

- `products` table: Contains both standard fields and columns for custom attributes (custom_*)
- `suppliers` table: Contains both standard fields and columns for custom attributes (custom_*)
- `custom_attributes` table: Defines attribute metadata (name, type, etc.)
- `custom_attribute_values` table: Deprecated - no longer used for storage

### Import Process

When importing product or supplier data:

1. CSV data is mapped to system fields and custom attributes
2. Custom attributes are directly stored in the corresponding columns
3. For MPN fields, data is stored in both the custom_mpn and mpn columns
4. The system uses an optimized matching algorithm to link supplier products to existing products

The UI shows clear visual indicators for match quality and provides detailed progress tracking during import.

## Key Features

- Hierarchical matching (EAN → MPN → name)
- Visual indicators for match quality
- Batch processing with configurable sizes
- Progress tracking with percentage display
- Performance optimizations for large imports

## Getting Started

[Instructions for setting up and running the application]

## Features

- Import Amazon product data
- Import supplier product data
- Match suppliers to products
- Calculate profit margins
- Optimize pricing
- **NEW: Large File Processing** - Handle supplier files up to several GB in size

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository
2. Install client dependencies: `npm install`
3. Install server dependencies: `cd src/server && npm install`
4. Create a `.env` file in the root directory with:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3001
```

5. Create a `.env` file in the `src/server` directory with:

```
VITE_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
SERVER_PORT=3001
```

### Running the application

1. Start the server:
```
cd src/server
npm run dev
```

2. In a separate terminal, start the client:
```
npm run dev
```

### Database Setup

Run the migrations in the `supabase/migrations` folder to set up your database schema.

## Large File Processing

The application now supports processing large supplier CSV files (1GB+) through server-side streaming:

### How it works

1. When a file larger than 10MB is detected, it is automatically processed on the server
2. Files are streamed and processed in chunks, avoiding memory issues
3. Progress is tracked and visible in the UI
4. A background job processes the data, allowing you to continue using the application

### Server Requirements

For handling large files, we recommend:
- At least 2GB RAM for the Node.js server
- Adequate disk space for temporary file storage
- A stable network connection

### Configuration

You can adjust these settings in the server's environment variables:

- `MAX_FILE_SIZE`: Maximum allowed file size (default: 2GB)
- `CHUNK_SIZE`: Number of rows processed in memory at once (default: 5000)
- `BATCH_SIZE`: Number of database operations per batch (default: determined by UI)

## License

This project is licensed under the MIT License - see the LICENSE file for details.