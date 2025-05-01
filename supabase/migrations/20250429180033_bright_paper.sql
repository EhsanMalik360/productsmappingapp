/*
  # Remove RLS from all tables
  
  1. Changes
    - Disable RLS on all tables (products, suppliers, supplier_products)
    - Drop all existing RLS policies
    - This allows access using the anon key without authentication
  
  2. Security Note
    - This is a temporary solution until proper authentication is implemented
    - Access control will be handled through the anon key restrictions
*/

-- Drop all existing policies for products
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON products;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON products;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON products;

-- Drop all existing policies for suppliers
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON suppliers;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON suppliers;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON suppliers;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON suppliers;

-- Drop all existing policies for supplier_products
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON supplier_products;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON supplier_products;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON supplier_products;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON supplier_products;

-- Disable RLS on all tables
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products DISABLE ROW LEVEL SECURITY;