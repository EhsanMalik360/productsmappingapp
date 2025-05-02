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