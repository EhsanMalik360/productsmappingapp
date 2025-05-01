-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Allow authenticated users to read products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to insert and upsert products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to update products" ON products;
DROP POLICY IF EXISTS "Allow authenticated users to delete products" ON products;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON products;

-- Create comprehensive policies for all operations
CREATE POLICY "Allow authenticated users to read products"
  ON products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert and upsert products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sale_price >= 0 AND
    units_sold >= 0 AND
    amazon_fee >= 0 AND
    buy_box_price >= 0 AND
    (rating IS NULL OR (rating >= 0 AND rating <= 5)) AND
    (review_count IS NULL OR review_count >= 0)
  );

CREATE POLICY "Allow authenticated users to update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    sale_price >= 0 AND
    units_sold >= 0 AND
    amazon_fee >= 0 AND
    buy_box_price >= 0 AND
    (rating IS NULL OR (rating >= 0 AND rating <= 5)) AND
    (review_count IS NULL OR review_count >= 0)
  );

CREATE POLICY "Allow authenticated users to delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (true);