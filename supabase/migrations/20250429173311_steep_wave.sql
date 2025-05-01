/*
  # Initial schema setup for Amazon Product Analysis

  1. New Tables
    - `products`
      - `id` (uuid, primary key)
      - `title` (text)
      - `ean` (text, unique)
      - `brand` (text)
      - `sale_price` (numeric)
      - `units_sold` (integer)
      - `amazon_fee` (numeric)
      - `buy_box_price` (numeric)
      - `category` (text)
      - `rating` (numeric)
      - `review_count` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `suppliers`
      - `id` (uuid, primary key)
      - `name` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `supplier_products`
      - `id` (uuid, primary key)
      - `supplier_id` (uuid, foreign key)
      - `product_id` (uuid, foreign key)
      - `cost` (numeric)
      - `moq` (integer)
      - `lead_time` (text)
      - `payment_terms` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  ean text UNIQUE NOT NULL,
  brand text NOT NULL,
  sale_price numeric NOT NULL CHECK (sale_price >= 0),
  units_sold integer NOT NULL DEFAULT 0 CHECK (units_sold >= 0),
  amazon_fee numeric NOT NULL DEFAULT 0 CHECK (amazon_fee >= 0),
  buy_box_price numeric NOT NULL DEFAULT 0 CHECK (buy_box_price >= 0),
  category text,
  rating numeric CHECK (rating >= 0 AND rating <= 5),
  review_count integer DEFAULT 0 CHECK (review_count >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create supplier_products table
CREATE TABLE IF NOT EXISTS supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  cost numeric NOT NULL CHECK (cost >= 0),
  moq integer DEFAULT 1 CHECK (moq >= 1),
  lead_time text DEFAULT '3 days',
  payment_terms text DEFAULT 'Net 30',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, product_id)
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

-- Create policies for products
CREATE POLICY "Enable read access for all authenticated users"
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

-- Create policies for suppliers
CREATE POLICY "Enable read access for all authenticated users"
ON suppliers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON suppliers FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON suppliers FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
ON suppliers FOR DELETE
TO authenticated
USING (true);

-- Create policies for supplier_products
CREATE POLICY "Enable read access for all authenticated users"
ON supplier_products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users"
ON supplier_products FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON supplier_products FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users"
ON supplier_products FOR DELETE
TO authenticated
USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_products_updated_at
    BEFORE UPDATE ON supplier_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();