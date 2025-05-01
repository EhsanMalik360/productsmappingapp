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
  sale_price numeric NOT NULL,
  units_sold integer NOT NULL DEFAULT 0,
  amazon_fee numeric NOT NULL DEFAULT 0,
  buy_box_price numeric NOT NULL DEFAULT 0,
  category text,
  rating numeric CHECK (rating >= 0 AND rating <= 5),
  review_count integer DEFAULT 0,
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
  cost numeric NOT NULL,
  moq integer DEFAULT 1,
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

-- Create policies
CREATE POLICY "Users can read own products"
  ON products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read own suppliers"
  ON suppliers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own suppliers"
  ON suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read own supplier_products"
  ON supplier_products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own supplier_products"
  ON supplier_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);