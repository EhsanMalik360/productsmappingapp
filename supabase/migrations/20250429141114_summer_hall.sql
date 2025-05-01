/*
  # Fix RLS policies for products table

  1. Changes
    - Drop existing RLS policies on products table
    - Create new policies that allow:
      - Authenticated users to read all products
      - Authenticated users to insert products
      - Authenticated users to update products
      - Authenticated users to delete products

  2. Security
    - Maintains RLS enabled on products table
    - Only authenticated users can perform CRUD operations
    - No restrictions on which products users can access (shared product catalog)
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own products" ON products;
DROP POLICY IF EXISTS "Users can insert own products" ON products;

-- Create new policies
CREATE POLICY "Enable read access for authenticated users"
ON products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON products FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON products FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
ON products FOR DELETE
TO authenticated
USING (true);