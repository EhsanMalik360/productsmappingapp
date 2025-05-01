/*
  # Update Products Table RLS Policies

  1. Changes
    - Remove existing RLS policies for products table
    - Add new comprehensive RLS policies that properly handle authentication
    
  2. Security
    - Enable RLS on products table
    - Add policies for authenticated users to perform CRUD operations
    - Maintain existing data validation checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to delete products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to insert and upsert products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to read products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to update products" ON products;

-- Create new policies with proper authentication checks
CREATE POLICY "Enable read access for authenticated users"
ON products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  (sale_price >= 0) AND 
  (units_sold >= 0) AND 
  (amazon_fee >= 0) AND 
  (buy_box_price >= 0) AND 
  (rating IS NULL OR (rating >= 0 AND rating <= 5)) AND 
  (review_count IS NULL OR review_count >= 0)
);

CREATE POLICY "Enable update access for authenticated users"
ON products FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  (sale_price >= 0) AND 
  (units_sold >= 0) AND 
  (amazon_fee >= 0) AND 
  (buy_box_price >= 0) AND 
  (rating IS NULL OR (rating >= 0 AND rating <= 5)) AND 
  (review_count IS NULL OR review_count >= 0)
);

CREATE POLICY "Enable delete access for authenticated users"
ON products FOR DELETE
TO authenticated
USING (true);