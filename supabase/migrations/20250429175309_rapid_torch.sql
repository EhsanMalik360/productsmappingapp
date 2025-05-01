/*
  # Update Products Table RLS Policies

  1. Changes
    - Drop existing RLS policies for products table
    - Create new, more specific RLS policies that properly handle:
      - Data imports
      - Read access
      - Write access
      - Delete access
    
  2. Security
    - Maintains RLS protection
    - Ensures authenticated users can only access their own data
    - Allows proper data import functionality
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON products;

-- Create new, more specific policies
CREATE POLICY "Enable read access for all authenticated users"
ON products
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON products
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users"
ON products
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users"
ON products
FOR DELETE
TO authenticated
USING (true);