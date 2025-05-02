/*
  # Add MPN field to products table and match_method field to supplier_products

  1. Changes
    - Add mpn column to products table
    - Add match_method column to supplier_products table to track how the match was made
    - Create index on mpn column for better query performance
    
  2. Security
    - Maintain existing RLS policies
*/

-- Add mpn column to products table
ALTER TABLE products
ADD COLUMN mpn text;

-- Create index on mpn column for better performance
CREATE INDEX idx_products_mpn ON products(mpn);

-- Add match_method column to supplier_products table
ALTER TABLE supplier_products
ADD COLUMN match_method text DEFAULT 'ean' NOT NULL;

-- Create comment on match_method column
COMMENT ON COLUMN supplier_products.match_method IS 'Method used for matching: ean, mpn, or name'; 