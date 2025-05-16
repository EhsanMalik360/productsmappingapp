/*
  # Add additional Amazon product columns

  This migration adds new columns to the products table to store all the Amazon import data fields:
  - ASIN
  - UPC
  - FBA Fees
  - Referral Fee based on current Buy Box price
  - Bought in past month
  - Estimated Monthly Revenue
  - FBA Sellers
  - Amazon Instock rate percentage
  - Dominant Seller percentage
  - Buy Box Seller Name
  - Count of retrieved live offers: New, FBA
*/

-- Add the new columns to the products table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS asin text,
  ADD COLUMN IF NOT EXISTS upc text,
  ADD COLUMN IF NOT EXISTS fba_fees numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bought_past_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_monthly_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fba_sellers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amazon_instock_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dominant_seller_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buy_box_seller_name text,
  ADD COLUMN IF NOT EXISTS live_offers_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mpn text;

-- Add indices for common lookups
CREATE INDEX IF NOT EXISTS products_asin_idx ON products(asin);
CREATE INDEX IF NOT EXISTS products_upc_idx ON products(upc);
CREATE INDEX IF NOT EXISTS products_mpn_idx ON products(mpn); 