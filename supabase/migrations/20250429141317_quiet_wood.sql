/*
  # Update products table RLS policies

  1. Changes
    - Drop existing restrictive policies
    - Add new policies for authenticated users to:
      - Read all products
      - Insert new products
      - Update existing products
      - Delete existing products
    
  2. Security
    - Maintain RLS enabled
    - Allow authenticated users full access to products
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own products" ON products;
DROP POLICY IF EXISTS "Users can insert own products" ON products;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON products;

-- Create new policies
CREATE POLICY "Allow authenticated users to read products"
  ON products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (true);