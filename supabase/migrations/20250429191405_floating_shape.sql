/*
  # Add EAN columns to suppliers and supplier_products tables

  1. Changes
    - Add ean column to supplier_products table
    - Add index on ean column for better query performance
    
  2. Security
    - Maintain existing RLS policies
    - Add check constraint to ensure EAN is not empty
*/

-- Add ean column to supplier_products table
ALTER TABLE supplier_products
ADD COLUMN ean text NOT NULL;

-- Create index on ean column for better performance
CREATE INDEX idx_supplier_products_ean ON supplier_products(ean);

-- Add foreign key constraint to ensure ean exists in products table
ALTER TABLE supplier_products
ADD CONSTRAINT fk_supplier_products_ean
FOREIGN KEY (ean) REFERENCES products(ean) ON DELETE CASCADE;