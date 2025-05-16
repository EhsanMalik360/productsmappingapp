# Amazon Import Field Mapping - Migration Instructions

## What's been done

1. **Django Model Updates**: Added all the requested Amazon product fields to the Django model
   - The Django migration has been successfully applied using `python manage.py migrate`

2. **Frontend Updates**: Added all requested field mappings to the import UI in `AmazonImport.tsx`
   - Updated display names to match your requirements

3. **Supabase Migration**: Created a migration file but it needs to be applied manually

## How to Apply the Supabase Migration

Since direct connection to Supabase database isn't working from your local machine, you'll need to run the SQL migration through the Supabase dashboard:

1. Log in to your [Supabase Dashboard](https://app.supabase.io)
2. Select your project
3. Go to "SQL Editor" from the left sidebar
4. Create a new SQL query
5. Paste the following SQL:

```sql
-- Add additional Amazon product columns
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
```

6. Click "Run" to execute the SQL
7. Check that the migration was successful by viewing the products table schema

## Verification

After applying the migration, you can:

1. Use the Supabase Table Editor to verify the columns were added
2. Import Amazon data with the new fields to test the functionality

## Next Steps

Once the migration is applied, you can start using all the new fields in your Amazon data imports. The frontend already supports mapping for:

- ASIN
- Product Name (title)
- Buy Box Price
- MPN
- EAN
- UPC
- FBA Fees
- Referral Fee
- Bought in Past Month
- Estimated Monthly Revenue
- FBA Sellers
- Amazon Instock Rate Percentage
- Dominant Seller Percentage
- Brand
- Buy Box Seller Name
- Count of Retrieved Live Offers
- Rating
- Reviews
- Monthly Units Sold 