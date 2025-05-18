-- Function to get count of products with multiple suppliers
CREATE OR REPLACE FUNCTION get_multi_supplier_products_count()
RETURNS integer AS $$
DECLARE
  multi_supplier_count integer;
BEGIN
  SELECT COUNT(DISTINCT product_id) INTO multi_supplier_count
  FROM (
    SELECT product_id
    FROM supplier_products
    WHERE product_id IS NOT NULL
    GROUP BY product_id
    HAVING COUNT(*) > 1
  ) AS multi_suppliers;
  
  RETURN multi_supplier_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate average profit margin
CREATE OR REPLACE FUNCTION get_average_profit_margin()
RETURNS numeric AS $$
DECLARE
  avg_margin numeric;
BEGIN
  SELECT AVG(profit_margin) INTO avg_margin
  FROM (
    SELECT 
      p.id, 
      p.buy_box_price, 
      p.fba_fees, 
      COALESCE(p.amazon_fee, 0) as amazon_fee,
      MIN(sp.cost) as min_cost,
      CASE 
        WHEN p.buy_box_price > 0 THEN
          ((p.buy_box_price - COALESCE(p.fba_fees, COALESCE(p.amazon_fee, 0)) - MIN(sp.cost)) / p.buy_box_price) * 100
        ELSE 0
      END as profit_margin
    FROM products p
    JOIN supplier_products sp ON p.id = sp.product_id
    GROUP BY p.id, p.buy_box_price, p.fba_fees, p.amazon_fee
    HAVING ((p.buy_box_price - COALESCE(p.fba_fees, COALESCE(p.amazon_fee, 0)) - MIN(sp.cost)) / p.buy_box_price) * 100 > 0
  ) AS profit_margins;
  
  RETURN COALESCE(avg_margin, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate total monthly profit
CREATE OR REPLACE FUNCTION get_total_monthly_profit()
RETURNS numeric AS $$
DECLARE
  total_profit numeric;
BEGIN
  SELECT SUM(monthly_profit) INTO total_profit
  FROM (
    SELECT 
      p.id,
      (p.buy_box_price - COALESCE(p.fba_fees, COALESCE(p.amazon_fee, 0)) - MIN(sp.cost)) * p.units_sold as monthly_profit
    FROM products p
    JOIN supplier_products sp ON p.id = sp.product_id
    GROUP BY p.id, p.buy_box_price, p.fba_fees, p.amazon_fee, p.units_sold
  ) AS product_profits;
  
  RETURN COALESCE(total_profit, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get current month's stats (simplified mock version)
-- In real implementation, this would compare current data with historical data
CREATE OR REPLACE FUNCTION get_current_month_stats()
RETURNS json AS $$
DECLARE
  stats json;
BEGIN
  WITH current_stats AS (
    SELECT
      COUNT(*) as total_products,
      (SELECT get_multi_supplier_products_count()) as multi_supplier_products,
      (SELECT get_average_profit_margin()) as avg_profit_margin,
      (SELECT get_total_monthly_profit()) as total_monthly_profit
  FROM products)
  
  SELECT row_to_json(current_stats) INTO stats FROM current_stats;
  RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- Function to get previous month's stats (simplified mock version)
-- In real implementation, this would query historical data
CREATE OR REPLACE FUNCTION get_previous_month_stats()
RETURNS json AS $$
DECLARE
  stats json;
  current_stats json;
  adjustment_factor numeric;
BEGIN
  SELECT get_current_month_stats() INTO current_stats;
  
  -- Generate a random adjustment factor between 0.8 and 1.2
  -- This simulates previous month data
  SELECT 0.8 + random() * 0.4 INTO adjustment_factor;
  
  WITH previous_stats AS (
    SELECT
      (current_stats->>'total_products')::numeric * adjustment_factor as total_products,
      (current_stats->>'multi_supplier_products')::numeric * adjustment_factor as multi_supplier_products,
      (current_stats->>'avg_profit_margin')::numeric * adjustment_factor as avg_profit_margin,
      (current_stats->>'total_monthly_profit')::numeric * adjustment_factor as total_monthly_profit
  )
  
  SELECT row_to_json(previous_stats) INTO stats FROM previous_stats;
  RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly sales data
CREATE OR REPLACE FUNCTION get_monthly_sales_data()
RETURNS TABLE(month text, sales numeric) AS $$
DECLARE
  months text[] := ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  current_month integer := EXTRACT(MONTH FROM current_date)::integer;
  base_revenue numeric;
  i integer;
BEGIN
  -- Get base revenue from current products
  SELECT SUM(buy_box_price * units_sold) INTO base_revenue FROM products;
  
  -- Generate simulated monthly data
  FOR i IN 0..5 LOOP
    month := months[(current_month - i + 11) % 12 + 1];
    sales := base_revenue * (0.8 + random() * 0.4); -- Random factor between 80% and 120%
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get top brands by profit
CREATE OR REPLACE FUNCTION get_top_brands_by_profit(limit_count integer DEFAULT 5)
RETURNS TABLE(brand text, profit numeric) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.brand,
    SUM((p.buy_box_price - COALESCE(p.fba_fees, COALESCE(p.amazon_fee, 0)) - MIN(sp.cost)) * p.units_sold) as total_profit
  FROM products p
  JOIN supplier_products sp ON p.id = sp.product_id
  GROUP BY p.brand
  ORDER BY total_profit DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get profit margin distribution
CREATE OR REPLACE FUNCTION get_profit_margin_distribution()
RETURNS TABLE(range_label text, count integer) AS $$
BEGIN
  -- Create temp table to hold profit margin ranges
  CREATE TEMP TABLE IF NOT EXISTS profit_ranges (
    label text,
    min_value numeric,
    max_value numeric
  ) ON COMMIT DROP;
  
  -- Clear the table if it already exists
  DELETE FROM profit_ranges;
  
  -- Insert profit margin ranges
  INSERT INTO profit_ranges VALUES
    ('Loss', -1000, 0),
    ('0-10%', 0, 10),
    ('11-20%', 10, 20),
    ('21-30%', 20, 30),
    ('31-40%', 30, 40),
    ('Over 40%', 40, 1000);
  
  -- Calculate distribution
  RETURN QUERY
  WITH profit_margins AS (
    SELECT 
      CASE 
        WHEN p.buy_box_price > 0 THEN
          ((p.buy_box_price - COALESCE(p.fba_fees, COALESCE(p.amazon_fee, 0)) - MIN(sp.cost)) / p.buy_box_price) * 100
        ELSE 0
      END as margin
    FROM products p
    LEFT JOIN supplier_products sp ON p.id = sp.product_id
    GROUP BY p.id, p.buy_box_price, p.fba_fees, p.amazon_fee
  )
  SELECT 
    pr.label,
    COUNT(pm.margin)::integer
  FROM profit_ranges pr
  LEFT JOIN profit_margins pm ON pm.margin > pr.min_value AND pm.margin <= pr.max_value
  GROUP BY pr.label, pr.min_value
  ORDER BY pr.min_value;
END;
$$ LANGUAGE plpgsql; 