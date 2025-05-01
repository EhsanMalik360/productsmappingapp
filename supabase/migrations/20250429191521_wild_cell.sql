/*
  # Add EAN column to supplier_products table

  1. Changes
    - Add EAN column to supplier_products table
    - Create index on EAN column
    - Add foreign key constraint to products table
    
  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity with foreign key constraint
*/

-- First add the column as nullable
ALTER TABLE supplier_products
ADD COLUMN ean text;

-- Create index on ean column for better performance
CREATE INDEX idx_supplier_products_ean ON supplier_products(ean);

-- Update existing rows with EAN from products table
UPDATE supplier_products sp
SET ean = p.ean
FROM products p
WHERE sp.product_id = p.id;

-- Now make the column NOT NULL
ALTER TABLE supplier_products
ALTER COLUMN ean SET NOT NULL;

-- Add foreign key constraint to ensure ean exists in products table
ALTER TABLE supplier_products
ADD CONSTRAINT fk_supplier_products_ean
FOREIGN KEY (ean) REFERENCES products(ean) ON DELETE CASCADE;